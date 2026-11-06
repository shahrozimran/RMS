-- Advisory agents only. No order, payment, stock or price writes are performed.
-- Jobs are inserted in the business transaction and processed by a separate worker.
BEGIN;

INSERT INTO public.system_settings(key,value) VALUES('agent_review_enabled','false') ON CONFLICT DO NOTHING;

CREATE TABLE public.agent_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
 generation integer NOT NULL DEFAULT 1 CHECK(generation>0),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','completed','dead')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 available_at timestamptz NOT NULL DEFAULT now(),
 lease_token uuid, locked_until timestamptz,
 last_error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_jobs_claim ON public.agent_jobs(status,available_at,locked_until);
CREATE INDEX IF NOT EXISTS product_ingredients_by_ingredient ON public.product_ingredients(ingredient_id,product_id);

CREATE TABLE public.agent_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 job_id uuid NOT NULL REFERENCES public.agent_jobs(id) ON DELETE CASCADE,
 generation integer NOT NULL,
 order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
 context_hash text NOT NULL, context jsonb NOT NULL,
 policy_version text NOT NULL, summary text NOT NULL CHECK(length(summary)<=2000),
 messages jsonb NOT NULL CHECK(jsonb_typeof(messages)='array'),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(job_id,generation)
);
CREATE INDEX agent_runs_recent ON public.agent_runs(created_at DESC);

CREATE TABLE public.agent_recommendations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 run_id uuid NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
 order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
 kind text NOT NULL CHECK(kind IN ('stock_pressure','recipe_review','order_review')),
 severity text NOT NULL CHECK(severity IN ('low','medium','high')),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
 summary text NOT NULL CHECK(length(summary) BETWEEN 1 AND 2000),
 evidence jsonb NOT NULL CHECK(jsonb_typeof(evidence)='array'),
 context_hash text NOT NULL,
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','acknowledged','dismissed','stale')),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes',
 reviewed_by uuid REFERENCES public.users(id), reviewed_at timestamptz,
 review_note text CHECK(length(review_note)<=500),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(run_id,kind)
);
CREATE INDEX agent_recommendations_recent ON public.agent_recommendations(status,created_at DESC);

ALTER TABLE public.agent_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY agent_jobs_admin_read ON public.agent_jobs FOR SELECT TO authenticated USING(public.is_admin());
CREATE POLICY agent_runs_admin_read ON public.agent_runs FOR SELECT TO authenticated USING(public.is_admin());
CREATE POLICY agent_recommendations_admin_read ON public.agent_recommendations FOR SELECT TO authenticated USING(public.is_admin());
REVOKE ALL ON public.agent_jobs,public.agent_runs,public.agent_recommendations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.agent_jobs,public.agent_runs,public.agent_recommendations TO authenticated;
GRANT ALL ON public.agent_jobs,public.agent_runs,public.agent_recommendations TO service_role;

CREATE FUNCTION public.queue_order_agent_job(p_order uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF (SELECT value FROM public.system_settings WHERE key='agent_review_enabled') IS DISTINCT FROM 'true'::jsonb THEN RETURN; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.orders WHERE id=p_order AND status IN ('active','billed')) THEN
   UPDATE public.agent_jobs SET status='completed',lease_token=NULL,locked_until=NULL,updated_at=now() WHERE order_id=p_order;
   UPDATE public.agent_recommendations SET status='stale' WHERE order_id=p_order AND status='open';
   RETURN;
 END IF;
 INSERT INTO public.agent_jobs(order_id,available_at) VALUES(p_order,now()+interval '2 seconds')
 ON CONFLICT(order_id) DO UPDATE SET generation=agent_jobs.generation+1,status='pending',attempts=0,
  available_at=now()+interval '2 seconds',lease_token=NULL,locked_until=NULL,last_error=NULL,updated_at=now();
 UPDATE public.agent_recommendations SET status='stale' WHERE order_id=p_order AND status='open';
END $$;

CREATE FUNCTION public.agent_order_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_TABLE_NAME='orders' THEN PERFORM public.queue_order_agent_job(NEW.id);
 ELSE PERFORM public.queue_order_agent_job(CASE WHEN TG_OP='DELETE' THEN OLD.order_id ELSE NEW.order_id END); END IF;
 RETURN NULL;
END $$;
CREATE TRIGGER agent_order_events AFTER INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.agent_order_changed();
CREATE TRIGGER agent_order_item_events AFTER INSERT OR UPDATE OR DELETE ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.agent_order_changed();

CREATE FUNCTION public.agent_inventory_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_order uuid; v_ingredient uuid; v_product uuid;
BEGIN
 IF (SELECT value FROM public.system_settings WHERE key='agent_review_enabled') IS DISTINCT FROM 'true'::jsonb THEN RETURN NULL; END IF;
 IF TG_TABLE_NAME='ingredients' THEN v_ingredient:=NEW.id;
 ELSIF TG_TABLE_NAME='products' THEN v_product:=NEW.id;
 ELSE v_product:=CASE WHEN TG_OP='DELETE' THEN OLD.product_id ELSE NEW.product_id END; END IF;
 FOR v_order IN SELECT DISTINCT o.id FROM public.orders o JOIN public.order_items oi ON oi.order_id=o.id
 WHERE o.status IN ('active','billed') AND (oi.product_id=v_product OR EXISTS(
   SELECT 1 FROM public.product_ingredients pi WHERE pi.product_id=oi.product_id AND pi.ingredient_id=v_ingredient)) ORDER BY o.id
 LOOP PERFORM public.queue_order_agent_job(v_order); END LOOP;
 RETURN NULL;
END $$;
CREATE TRIGGER agent_stock_events AFTER UPDATE OF quantity_available,reorder_threshold,unit ON public.ingredients FOR EACH ROW EXECUTE FUNCTION public.agent_inventory_changed();
CREATE TRIGGER agent_product_events AFTER UPDATE OF is_available,is_86d,price_variants ON public.products FOR EACH ROW EXECUTE FUNCTION public.agent_inventory_changed();
CREATE TRIGGER agent_recipe_events AFTER INSERT OR UPDATE OR DELETE ON public.product_ingredients FOR EACH ROW EXECUTE FUNCTION public.agent_inventory_changed();

-- A single SQL statement builds a consistent, bounded snapshot without customer PII.
CREATE FUNCTION public.agent_order_context(p_order uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER STABLE SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object(
  'order',jsonb_build_object('id',o.id,'status',o.status,'created_at',o.created_at,'updated_at',o.updated_at,'source',o.source),
  'products',COALESCE((SELECT jsonb_agg(x.data ORDER BY x.product_id) FROM (
    SELECT oi.product_id,jsonb_build_object('id',oi.product_id,'name',COALESCE(p.name,'Deleted menu item'),
      'quantity',sum(oi.quantity),'available',COALESCE(p.is_available AND NOT p.is_86d,false),
      'has_variants',COALESCE(p.price_variants IS NOT NULL AND p.price_variants<>'[]'::jsonb,false),
      'has_modifiers',bool_or(CASE WHEN jsonb_typeof(oi.selected_modifiers)='array' THEN jsonb_array_length(oi.selected_modifiers)>0 ELSE false END),
      'has_recipe',EXISTS(SELECT 1 FROM public.product_ingredients pi WHERE pi.product_id=oi.product_id)) data
    FROM public.order_items oi LEFT JOIN public.products p ON p.id=oi.product_id WHERE oi.order_id=o.id
    GROUP BY oi.product_id,p.id,p.name,p.is_available,p.is_86d,p.price_variants
  )x),'[]'::jsonb),
  'ingredients',COALESCE((SELECT jsonb_agg(x.data ORDER BY x.ingredient_id) FROM (
    SELECT i.id ingredient_id,jsonb_build_object('id',i.id,'name',i.name,'unit',i.unit,
      'on_hand',i.quantity_available,'threshold',i.reorder_threshold,'required',sum(oi.quantity*pi.quantity_used),
      'open_demand',(SELECT COALESCE(sum(open_item.quantity*recipe.quantity_used),0)
        FROM public.order_items open_item JOIN public.orders open_order ON open_order.id=open_item.order_id
        JOIN public.product_ingredients recipe ON recipe.product_id=open_item.product_id
        WHERE recipe.ingredient_id=i.id AND open_order.status IN ('active','billed'))) data
    FROM public.order_items oi JOIN public.product_ingredients pi ON pi.product_id=oi.product_id
    JOIN public.ingredients i ON i.id=pi.ingredient_id WHERE oi.order_id=o.id
    GROUP BY i.id,i.name,i.unit,i.quantity_available,i.reorder_threshold
  )x),'[]'::jsonb)
 ) FROM public.orders o WHERE o.id=p_order
$$;

CREATE FUNCTION public.set_agent_review_enabled(p_actor uuid,p_enabled boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT public.assert_actor(p_actor,'reports','read') THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
 IF p_enabled IS NULL THEN RAISE EXCEPTION 'Enabled flag required' USING ERRCODE='22023'; END IF;
 INSERT INTO public.system_settings(key,value,updated_by) VALUES('agent_review_enabled',to_jsonb(p_enabled),p_actor)
 ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=p_actor;
 INSERT INTO public.activity_logs(user_id,action,entity_type,details) VALUES(p_actor,'AGENT_REVIEWS_CONFIGURED','agents',jsonb_build_object('enabled',p_enabled));
 RETURN p_enabled;
END $$;

CREATE FUNCTION public.queue_agent_reviews(p_actor uuid,p_order uuid DEFAULT NULL) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_order uuid; v_count integer:=0;
BEGIN
 IF NOT public.assert_actor(p_actor,'reports','read') THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
 IF (SELECT value FROM public.system_settings WHERE key='agent_review_enabled') IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'Enable order reviews first' USING ERRCODE='22023'; END IF;
 FOR v_order IN SELECT id FROM public.orders WHERE status IN ('active','billed') AND (p_order IS NULL OR id=p_order) ORDER BY created_at DESC LIMIT 25
 LOOP PERFORM public.queue_order_agent_job(v_order); v_count:=v_count+1; END LOOP;
 INSERT INTO public.activity_logs(user_id,action,entity_type,details) VALUES(p_actor,'AGENT_REVIEWS_QUEUED','agents',jsonb_build_object('count',v_count));
 RETURN v_count;
END $$;

CREATE FUNCTION public.claim_agent_job() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j public.agent_jobs; snapshot jsonb;
BEGIN
 IF (SELECT value FROM public.system_settings WHERE key='agent_review_enabled') IS DISTINCT FROM 'true'::jsonb THEN RETURN NULL; END IF;
 UPDATE public.agent_jobs SET status='dead',lease_token=NULL,locked_until=NULL,last_error='LEASE_EXHAUSTED',updated_at=now()
 WHERE status='processing' AND locked_until<=now() AND attempts>=5;
 SELECT * INTO j FROM public.agent_jobs WHERE attempts<5 AND
   ((status='pending' AND available_at<=now()) OR (status='processing' AND locked_until<=now()))
 ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF;
 UPDATE public.agent_jobs SET status='processing',attempts=attempts+1,lease_token=gen_random_uuid(),locked_until=now()+interval '60 seconds',updated_at=now()
 WHERE id=j.id RETURNING * INTO j;
 snapshot:=public.agent_order_context(j.order_id);
 RETURN jsonb_build_object('id',j.id,'generation',j.generation,'lease_token',j.lease_token,'context',snapshot,'context_hash',md5(snapshot::text),'captured_at',now());
END $$;

CREATE FUNCTION public.complete_agent_job(p_job uuid,p_lease uuid,p_generation integer,p_hash text,p_output jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j public.agent_jobs; snapshot jsonb; v_run uuid; finding jsonb;
BEGIN
 SELECT * INTO j FROM public.agent_jobs WHERE id=p_job FOR UPDATE;
 IF NOT FOUND OR j.status<>'processing' OR j.lease_token IS DISTINCT FROM p_lease OR j.generation IS DISTINCT FROM p_generation OR j.locked_until<=now() THEN RETURN false; END IF;
 snapshot:=public.agent_order_context(j.order_id);
 IF md5(snapshot::text) IS DISTINCT FROM p_hash THEN PERFORM public.queue_order_agent_job(j.order_id); RETURN false; END IF;
 IF (SELECT value FROM public.system_settings WHERE key='agent_review_enabled') IS DISTINCT FROM 'true'::jsonb THEN
   UPDATE public.agent_jobs SET status='pending',lease_token=NULL,locked_until=NULL WHERE id=j.id; RETURN false;
 END IF;
 IF p_output->>'schema_version' IS DISTINCT FROM '1' OR p_output->>'policy_version' IS DISTINCT FROM 'rules.v1'
 OR jsonb_typeof(p_output->'messages') IS DISTINCT FROM 'array' OR jsonb_array_length(p_output->'messages')<>3
 OR jsonb_typeof(p_output->'findings') IS DISTINCT FROM 'array' OR jsonb_array_length(p_output->'findings')>3
 OR length(p_output->>'summary') NOT BETWEEN 1 AND 2000 OR length(p_output::text)>65536 THEN
   RAISE EXCEPTION 'Invalid agent output' USING ERRCODE='22023';
 END IF;
 INSERT INTO public.agent_runs(job_id,generation,order_id,context_hash,context,policy_version,summary,messages)
 VALUES(j.id,j.generation,j.order_id,p_hash,snapshot,p_output->>'policy_version',p_output->>'summary',p_output->'messages') RETURNING id INTO v_run;
 UPDATE public.agent_recommendations SET status='stale' WHERE order_id=j.order_id AND status='open';
 FOR finding IN SELECT value FROM jsonb_array_elements(p_output->'findings') LOOP
   INSERT INTO public.agent_recommendations(run_id,order_id,kind,severity,title,summary,evidence,context_hash)
   VALUES(v_run,j.order_id,finding->>'kind',finding->>'severity',finding->>'title',finding->>'summary',finding->'evidence',p_hash);
 END LOOP;
 UPDATE public.agent_jobs SET status='completed',lease_token=NULL,locked_until=NULL,last_error=NULL,updated_at=now() WHERE id=j.id;
 RETURN true;
END $$;

CREATE FUNCTION public.fail_agent_job(p_job uuid,p_lease uuid,p_generation integer,p_error text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_error IS NULL OR p_error NOT IN ('INVALID_CONTEXT','ENGINE_FAILURE','WORKER_FAILURE') THEN RAISE EXCEPTION 'Invalid worker error code' USING ERRCODE='22023'; END IF;
 UPDATE public.agent_jobs SET status=CASE WHEN attempts>=5 THEN 'dead' ELSE 'pending' END,
   available_at=now()+make_interval(secs=>LEAST(300,5*(2^attempts)::integer)),lease_token=NULL,locked_until=NULL,last_error=p_error,updated_at=now()
 WHERE id=p_job AND status='processing' AND lease_token=p_lease AND generation=p_generation AND locked_until>now();
 RETURN FOUND;
END $$;

CREATE FUNCTION public.review_agent_recommendation(p_actor uuid,p_id uuid,p_decision text,p_note text DEFAULT '') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.agent_recommendations; v_status text;
BEGIN
 IF NOT public.assert_actor(p_actor,'reports','read') THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
 IF p_decision NOT IN ('acknowledged','dismissed') OR p_decision IS NULL OR length(COALESCE(p_note,''))>500 THEN RAISE EXCEPTION 'Invalid review' USING ERRCODE='22023'; END IF;
 SELECT * INTO r FROM public.agent_recommendations WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recommendation not found' USING ERRCODE='P0002'; END IF;
 IF r.status<>'open' THEN RAISE EXCEPTION 'Recommendation already reviewed or superseded' USING ERRCODE='40001'; END IF;
 v_status:=CASE WHEN r.expires_at<=now() OR r.context_hash IS DISTINCT FROM md5(public.agent_order_context(r.order_id)::text) THEN 'stale' ELSE p_decision END;
 UPDATE public.agent_recommendations SET status=v_status,reviewed_by=p_actor,reviewed_at=now(),review_note=trim(COALESCE(p_note,'')) WHERE id=r.id;
 INSERT INTO public.activity_logs(user_id,action,entity_type,entity_id,details)
 VALUES(p_actor,'AGENT_RECOMMENDATION_REVIEWED','agent_recommendation',r.id::text,jsonb_build_object('status',v_status,'note',trim(COALESCE(p_note,''))));
 RETURN jsonb_build_object('id',r.id,'status',v_status);
END $$;

-- These RPCs are only callable by the trusted server/worker. Admin browser reads use RLS.
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('queue_order_agent_job','agent_order_changed','agent_inventory_changed','agent_order_context',
  'set_agent_review_enabled','queue_agent_reviews','claim_agent_job','complete_agent_job','fail_agent_job','review_agent_recommendation')
 LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature); END LOOP;
END $$;
COMMIT;
