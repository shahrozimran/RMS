BEGIN;

ALTER TABLE public.orders ADD COLUMN inventory_confirmed_at timestamptz,
  ADD COLUMN confirmation_key uuid, ADD COLUMN confirmation_hash bytea;
CREATE UNIQUE INDEX orders_confirmation_request ON public.orders(staff_id,confirmation_key)
  WHERE confirmation_key IS NOT NULL;
CREATE INDEX order_items_product_order ON public.order_items(product_id,order_id);
CREATE INDEX stock_deductions_by_order ON public.stock_transactions(reference_id) WHERE type='deduction';

-- An empty snapshot is intentional. Changing a recipe never changes what an accepted ticket used.
CREATE TABLE public.order_recipe_snapshots (
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  recipe jsonb NOT NULL,
  PRIMARY KEY(order_id,product_id)
);
CREATE TABLE public.ingredient_review_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ingredient_id uuid NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE
);
ALTER TABLE public.order_recipe_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredient_review_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_recipe_snapshots,public.ingredient_review_events FROM PUBLIC,anon,authenticated;

ALTER TABLE public.team_alerts DROP CONSTRAINT team_alerts_kind_check;
ALTER TABLE public.team_alerts ADD CONSTRAINT team_alerts_kind_check
  CHECK (kind IN ('staff_message','issue','check_failed','low_stock'));

-- Queue invalidation asynchronously. A busy kitchen transaction only locks its own order
-- and the affected ingredient rows, never another order's review job.
DROP TRIGGER agent_stock_events ON public.ingredients;
CREATE FUNCTION public.record_ingredient_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF (SELECT value FROM public.system_settings WHERE key='agent_review_enabled')='true'::jsonb THEN
    INSERT INTO public.ingredient_review_events(ingredient_id) VALUES(NEW.id);
  END IF;
  IF NEW.quantity_available<=NEW.reorder_threshold AND OLD.quantity_available>OLD.reorder_threshold THEN
    INSERT INTO public.notifications(target_role,type,message,entity_id)
      VALUES('admin','low_stock',format('%s has %s %s left.',NEW.name,NEW.quantity_available,NEW.unit),NEW.id::text);
    INSERT INTO public.team_alerts(recipient_id,kind,title,message)
      SELECT u.id,'low_stock','Low stock Â· '||left(NEW.name,100),
        format('%s has %s %s left. The low stock level is %s %s.',
          left(NEW.name,120),NEW.quantity_available,left(NEW.unit,50),NEW.reorder_threshold,left(NEW.unit,50))
      FROM public.users u JOIN public.roles r ON r.id=u.role_id
      WHERE r.name='Admin' AND u.status='active' AND u.auth_user_id IS NOT NULL;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER ingredient_stock_changed AFTER UPDATE OF quantity_available,reorder_threshold ON public.ingredients
  FOR EACH ROW WHEN (OLD.quantity_available IS DISTINCT FROM NEW.quantity_available
    OR OLD.reorder_threshold IS DISTINCT FROM NEW.reorder_threshold) EXECUTE FUNCTION public.record_ingredient_change();

CREATE FUNCTION public.refresh_ingredient_reviews() RETURNS void
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE affected uuid;
BEGIN
  FOR affected IN
    WITH batch AS (
      SELECT id FROM public.ingredient_review_events ORDER BY id LIMIT 200 FOR UPDATE SKIP LOCKED
    ), changed AS (
      DELETE FROM public.ingredient_review_events e USING batch b WHERE e.id=b.id RETURNING e.ingredient_id
    ), ingredient_ids AS (
      SELECT DISTINCT ingredient_id FROM changed
    ), relevant AS (
      SELECT m.order_id FROM public.order_stock_movements m
        JOIN ingredient_ids c ON c.ingredient_id=m.ingredient_id WHERE m.reversed_at IS NULL
      UNION
      SELECT oi.order_id FROM ingredient_ids c JOIN public.product_ingredients pi ON pi.ingredient_id=c.ingredient_id
        JOIN public.order_items oi ON oi.product_id=pi.product_id
    )
    SELECT o.id FROM relevant r JOIN public.orders o ON o.id=r.order_id
      WHERE o.status IN ('active','billed') ORDER BY o.id
  LOOP
    -- An order that changed after the stock event already has a pending review.
    IF NOT EXISTS(SELECT 1 FROM public.agent_jobs WHERE order_id=affected AND status='pending') THEN
      PERFORM public.queue_order_agent_job(affected);
    END IF;
  END LOOP;
END $$;
CREATE INDEX order_stock_movements_by_ingredient ON public.order_stock_movements(ingredient_id,order_id);

CREATE FUNCTION public.sync_order_ingredients(p_order uuid,p_actor uuid,p_items jsonb,p_note text) RETURNS void
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE line record; stock public.ingredients; delta numeric;
BEGIN
  INSERT INTO public.order_recipe_snapshots(order_id,product_id,recipe)
    SELECT p_order,items.product_id,COALESCE((
      SELECT jsonb_object_agg(pi.ingredient_id,pi.quantity_used)
      FROM public.product_ingredients pi WHERE pi.product_id=items.product_id
    ),'{}'::jsonb)
    FROM (SELECT DISTINCT (x->>'product_id')::uuid product_id FROM jsonb_array_elements(p_items) x) items
    WHERE items.product_id IS NOT NULL
    ON CONFLICT(order_id,product_id) DO NOTHING;

  FOR line IN
    WITH desired AS (
      SELECT usage.key::uuid ingredient_id,sum((x->>'quantity')::integer*usage.value::numeric) quantity
      FROM jsonb_array_elements(p_items) x
      JOIN public.order_recipe_snapshots s ON s.order_id=p_order AND s.product_id=(x->>'product_id')::uuid
      CROSS JOIN LATERAL jsonb_each_text(s.recipe) usage GROUP BY usage.key
    ), previous AS (
      SELECT ingredient_id,quantity FROM public.order_stock_movements WHERE order_id=p_order AND reversed_at IS NULL
    )
    SELECT ingredient_id,COALESCE(desired.quantity,0) needed,COALESCE(previous.quantity,0) recorded
    FROM desired FULL JOIN previous USING(ingredient_id)
    WHERE COALESCE(desired.quantity,0)<>COALESCE(previous.quantity,0)
    ORDER BY ingredient_id
  LOOP
    SELECT * INTO STRICT stock FROM public.ingredients WHERE id=line.ingredient_id FOR UPDATE;
    delta:=line.needed-line.recorded;
    IF delta>0 AND stock.quantity_available<delta THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE=format(
        'Insufficient ingredient stock. %s needs %s %s more for this order, and %s %s is available. Reduce the order or update stock.',
        left(stock.name,120),trim_scale(delta),left(stock.unit,50),trim_scale(stock.quantity_available),left(stock.unit,50));
    END IF;
    UPDATE public.ingredients SET quantity_available=quantity_available-delta WHERE id=stock.id;
    IF line.needed>0 THEN
      INSERT INTO public.order_stock_movements(order_id,ingredient_id,quantity) VALUES(p_order,stock.id,line.needed)
        ON CONFLICT(order_id,ingredient_id) DO UPDATE SET quantity=EXCLUDED.quantity,reversed_at=NULL;
    ELSE
      DELETE FROM public.order_stock_movements WHERE order_id=p_order AND ingredient_id=stock.id;
    END IF;
    INSERT INTO public.stock_transactions(ingredient_id,type,quantity,reference_id,performed_by,notes)
      VALUES(stock.id,CASE WHEN delta>0 THEN 'deduction' ELSE 'adjustment' END,abs(delta),p_order,p_actor,p_note);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.deduct_stock_for_order(p_order_id uuid,p_performed_by uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o public.orders; items jsonb;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id=p_order_id AND status='paid' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order must be paid before stock deduction' USING ERRCODE='22023'; END IF;
  -- Only older open tickets still deduct at payment. Never re-price stock for confirmed tickets.
  IF o.inventory_confirmed_at IS NOT NULL
    OR EXISTS(SELECT 1 FROM public.order_stock_movements WHERE order_id=o.id)
    OR EXISTS(SELECT 1 FROM public.stock_transactions WHERE reference_id=o.id AND type='deduction') THEN RETURN; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('product_id',product_id,'quantity',quantity)),'[]')
    INTO items FROM public.order_items WHERE order_id=o.id AND product_id IS NOT NULL;
  PERFORM public.sync_order_ingredients(o.id,p_performed_by,items,'Payment for order created before inventory tracking');
END $$;

CREATE FUNCTION public.add_raw_ingredient(p_actor uuid,p_name text,p_unit text,p_quantity numeric,p_threshold numeric) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ingredient uuid;
BEGIN
  IF NOT public.assert_actor(p_actor,'inventory','write') THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
  IF COALESCE(length(trim(p_name)),0) NOT BETWEEN 1 AND 120 OR p_unit IS NULL OR p_unit NOT IN ('g','kg','mL','L','pcs')
    OR p_quantity IS NULL OR p_quantity NOT BETWEEN 0 AND 9999999.999 OR p_quantity<>round(p_quantity,3)
    OR p_threshold IS NULL OR p_threshold NOT BETWEEN 0 AND 9999999.999 OR p_threshold<>round(p_threshold,3) THEN
    RAISE EXCEPTION 'Enter a name, unit and valid stock amounts' USING ERRCODE='22023';
  END IF;
  -- Imported names may predate this screen. Only new names must be unique regardless of case.
  PERFORM pg_advisory_xact_lock(hashtextextended('ingredient:'||lower(trim(p_name)),0));
  IF EXISTS(SELECT 1 FROM public.ingredients WHERE lower(trim(name))=lower(trim(p_name))) THEN
    RAISE EXCEPTION 'That ingredient already exists. Update its stock instead.' USING ERRCODE='23505';
  END IF;
  INSERT INTO public.ingredients(name,unit,quantity_available,reorder_threshold)
    VALUES(trim(p_name),p_unit,p_quantity,p_threshold) RETURNING id INTO ingredient;
  IF p_quantity>0 THEN
    INSERT INTO public.stock_transactions(ingredient_id,type,quantity,performed_by,notes)
      VALUES(ingredient,'top_up',p_quantity,p_actor,'Opening stock');
  END IF;
  INSERT INTO public.activity_logs(user_id,action,entity_type,entity_id)
    VALUES(p_actor,'INGREDIENT_CREATED','ingredient',ingredient::text);
  RETURN ingredient;
END $$;

CREATE FUNCTION public.update_ingredient_stock(p_actor uuid,p_id uuid,p_count numeric,p_threshold numeric,p_expected_at timestamptz,p_note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE stock public.ingredients; delta numeric;
BEGIN
  IF NOT public.assert_actor(p_actor,'inventory','write') THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
  IF p_count IS NULL OR p_count NOT BETWEEN 0 AND 9999999.999 OR p_count<>round(p_count,3)
    OR p_threshold IS NULL OR p_threshold NOT BETWEEN 0 AND 9999999.999 OR p_threshold<>round(p_threshold,3)
    OR COALESCE(length(trim(p_note)),0) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'Enter valid stock amounts and a reason' USING ERRCODE='22023';
  END IF;
  SELECT * INTO stock FROM public.ingredients WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ingredient not found' USING ERRCODE='P0002'; END IF;
  IF stock.quantity_available=p_count AND stock.reorder_threshold=p_threshold THEN RETURN; END IF;
  IF stock.updated_at IS DISTINCT FROM p_expected_at THEN
    RAISE EXCEPTION 'The stock changed while you were editing. Refresh the count and try again.' USING ERRCODE='40001';
  END IF;
  delta:=p_count-stock.quantity_available;
  UPDATE public.ingredients SET quantity_available=p_count,reorder_threshold=p_threshold WHERE id=p_id;
  IF delta<>0 THEN
    INSERT INTO public.stock_transactions(ingredient_id,type,quantity,performed_by,notes)
      VALUES(p_id,'adjustment',delta,p_actor,trim(p_note));
  END IF;
  INSERT INTO public.activity_logs(user_id,action,entity_type,entity_id,details)
    VALUES(p_actor,'INGREDIENT_STOCK_UPDATED','ingredient',p_id::text,jsonb_build_object(
      'previous_count',stock.quantity_available,'new_count',p_count,'previous_threshold',stock.reorder_threshold,
      'new_threshold',p_threshold,'reason',trim(p_note)));
END $$;

CREATE FUNCTION public.save_ingredient_recipe(p_actor uuid,p_product uuid,p_lines jsonb,p_previous jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE current_lines jsonb;
BEGIN
  IF NOT public.assert_actor(p_actor,'inventory','write') THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'object' OR EXISTS(
    SELECT 1 FROM jsonb_each(p_lines) l
    LEFT JOIN public.ingredients i ON i.id=l.key::uuid
    WHERE i.id IS NULL OR jsonb_typeof(l.value)<>'number' OR (l.value::text)::numeric NOT BETWEEN 0.001 AND 9999999.999
      OR (l.value::text)::numeric<>round((l.value::text)::numeric,3)
  ) OR (SELECT count(*) FROM jsonb_each(p_lines))>40 THEN
    RAISE EXCEPTION 'Choose up to 40 different ingredients with positive amounts' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.products WHERE id=p_product FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Menu item not found' USING ERRCODE='P0002'; END IF;
  SELECT COALESCE(jsonb_object_agg(ingredient_id,quantity_used),'{}') INTO current_lines
    FROM public.product_ingredients WHERE product_id=p_product;
  IF current_lines=p_lines THEN RETURN; END IF;
  IF current_lines IS DISTINCT FROM p_previous THEN
    RAISE EXCEPTION 'This recipe changed while you were editing. Refresh it and try again.' USING ERRCODE='40001';
  END IF;
  DELETE FROM public.product_ingredients WHERE product_id=p_product AND NOT (p_lines ? ingredient_id::text);
  INSERT INTO public.product_ingredients(product_id,ingredient_id,quantity_used)
    SELECT p_product,l.key::uuid,l.value::numeric FROM jsonb_each_text(p_lines) l
    ON CONFLICT(product_id,ingredient_id) DO UPDATE SET quantity_used=EXCLUDED.quantity_used
    WHERE product_ingredients.quantity_used IS DISTINCT FROM EXCLUDED.quantity_used;
  INSERT INTO public.activity_logs(user_id,action,entity_type,entity_id,details)
    VALUES(p_actor,'INGREDIENT_RECIPE_SAVED','product',p_product::text,jsonb_build_object('recipe',p_lines));
END $$;

CREATE FUNCTION public.recipe_yield(p_product uuid) RETURNS numeric
LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
  SELECT min(div(greatest(i.quantity_available,0),pi.quantity_used))
  FROM public.product_ingredients pi JOIN public.ingredients i ON i.id=pi.ingredient_id WHERE pi.product_id=p_product
$$;

CREATE FUNCTION public.inventory_workspace(p_actor uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT public.assert_actor(p_actor,'inventory','read') THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object(
    'ingredients',COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.name,i.id) FROM (
      SELECT id,name,unit,quantity_available,reorder_threshold,updated_at FROM public.ingredients
    ) i),'[]'),
    'products',COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.name,p.id) FROM (
      SELECT id,name,(is_available AND NOT is_86d) available,
        (jsonb_array_length(COALESCE(price_variants,'[]'))>0 OR EXISTS(
          SELECT 1 FROM public.modifiers m WHERE m.product_id=products.id AND m.is_active
        )) has_options,
        public.recipe_yield(id) makeable,
        COALESCE((SELECT jsonb_object_agg(ingredient_id,quantity_used) FROM public.product_ingredients WHERE product_id=products.id),'{}') recipe
      FROM public.products
    ) p),'[]'),
    'history',COALESCE((SELECT jsonb_agg(to_jsonb(h) ORDER BY h.created_at DESC,h.id) FROM (
      SELECT s.id,s.type,s.quantity,s.reference_id,s.notes,s.created_at,i.name,i.unit,u.name AS performed_by
      FROM public.stock_transactions s JOIN public.ingredients i ON i.id=s.ingredient_id
      LEFT JOIN public.users u ON u.id=s.performed_by ORDER BY s.created_at DESC,s.id LIMIT 50
    ) h),'[]')
  );
END $$;

CREATE FUNCTION public.inventory_question_facts(p_actor uuid,p_question text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE terms tsquery; low_stock boolean; production boolean; facts jsonb;
BEGIN
  IF NOT public.assert_actor(p_actor,'inventory','read') THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
  low_stock:=p_question ~* '(low stock|running low|reorder|out of stock|shortages?)';
  production:=p_question ~* '\m(make|prepare|cook|produce|yield|servings?|capacity|enough|recipes?)\M';
  IF NOT low_stock AND NOT production AND p_question !~* '\m(stock|inventory|ingredients?|available|left|have)\M' THEN RETURN '[]'; END IF;
  SELECT to_tsquery('english',string_agg(quote_literal(word),' | ')) INTO terms
    FROM unnest(tsvector_to_array(to_tsvector('english',left(p_question,800)))) word WHERE length(word)>2
      AND word NOT IN ('stock','inventori','ingredi','avail','left','low','make','cook','prepar','recip','mani','much','doe','serv','product','menu');
  SELECT COALESCE(jsonb_agg(to_jsonb(f)),'[]') INTO facts FROM (
    SELECT 'F-S-'||left(i.id::text,30) id,'live' kind,left(i.name,160) title,
      format('%s %s on hand. Low stock level is %s %s.',trim_scale(i.quantity_available),i.unit,trim_scale(i.reorder_threshold),i.unit) excerpt
    FROM public.ingredients i
    WHERE (low_stock AND i.quantity_available<=i.reorder_threshold) OR to_tsvector('english',i.name) @@ terms
    ORDER BY COALESCE(ts_rank(to_tsvector('english',i.name),terms),0) DESC,i.name,i.id LIMIT 3
  ) f;
  IF production THEN
    facts:=(SELECT COALESCE(jsonb_agg(to_jsonb(f)),'[]') FROM (
      SELECT 'F-Y-'||left(p.id::text,30) id,'live' kind,left(p.name,160) title,
        CASE WHEN y.makeable IS NULL THEN 'No recipe is saved, so there is no stock estimate.'
          ELSE format('Remaining ingredients can make up to %s of this dish using its base recipe. This estimate is for this dish alone. Other dishes may use the same stock.',y.makeable) END excerpt
      FROM public.products p CROSS JOIN LATERAL (SELECT public.recipe_yield(p.id) makeable) y
      WHERE to_tsvector('english',p.name) @@ terms OR (terms IS NULL AND y.makeable IS NOT NULL AND p.is_available AND NOT p.is_86d)
      ORDER BY ts_rank(to_tsvector('english',p.name),terms) DESC,p.name,p.id LIMIT 3
    ) f)||facts;
  END IF;
  IF low_stock AND facts='[]' THEN
    RETURN jsonb_build_array(jsonb_build_object('id','F-low-stock','kind','live','title','Low stock now',
      'excerpt','No tracked ingredients are at or below their low stock level.'));
  END IF;
  RETURN facts;
END $$;


CREATE OR REPLACE FUNCTION public.save_order(p_actor uuid,p_payload jsonb,p_order_id uuid DEFAULT NULL,p_source text DEFAULT 'staff') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_admin boolean; o public.orders; v_items jsonb; v_sc jsonb; v_sub numeric; v_tax numeric; v_charge numeric;
 v_key uuid; v_hash bytea; v_table integer; v_old_table integer; v_type text;
BEGIN
 v_admin:=public.assert_actor(p_actor,'orders','write');
 IF p_source NOT IN ('staff','qr') THEN RAISE EXCEPTION 'Invalid source' USING ERRCODE='22023'; END IF;
 IF p_order_id IS NULL AND p_source='staff' AND p_payload ? '_request_id' THEN
   v_key:=(p_payload->>'_request_id')::uuid;
   IF v_key IS NOT NULL THEN
     v_hash:=sha256(convert_to(p_payload::text,'UTF8'));
     PERFORM pg_advisory_xact_lock(hashtextextended('pos:'||p_actor||':'||v_key,0));
     SELECT * INTO o FROM public.orders WHERE staff_id=p_actor AND confirmation_key=v_key;
     IF FOUND THEN
       IF o.confirmation_hash IS DISTINCT FROM v_hash THEN
         RAISE EXCEPTION 'This order request was already used' USING ERRCODE='40001';
       END IF;
       RETURN to_jsonb(o)-'confirmation_hash';
     END IF;
   END IF;
 END IF;
 IF p_order_id IS NOT NULL THEN
   SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR NO KEY UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='P0002'; END IF;
   IF NOT v_admin AND o.staff_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
   IF o.status NOT IN ('draft','active','billed') THEN RAISE EXCEPTION 'Order is no longer editable' USING ERRCODE='40001'; END IF;
   v_old_table:=o.table_id;
 END IF;
 v_type:=p_payload->>'order_type'; v_table:=(p_payload->>'table_id')::integer;
 IF v_type NOT IN ('dine_in','takeaway','delivery') OR v_type IS NULL OR (v_type='dine_in' AND v_table IS NULL) THEN
   RAISE EXCEPTION 'A dine-in order requires a table' USING ERRCODE='22023'; END IF;
 IF v_type<>'dine_in' THEN v_table:=NULL; END IF;
 -- Consistent table lock order also covers moves between tables.
 PERFORM 1 FROM public.tables WHERE id IN(v_old_table,v_table) ORDER BY id FOR UPDATE;
 IF v_table IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.tables WHERE id=v_table AND status NOT IN ('reserved','cleaning')) THEN
   RAISE EXCEPTION 'Table is unavailable' USING ERRCODE='22023'; END IF;
 v_items:=public.price_order_items(p_payload->'items');
 SELECT sum((value->>'subtotal')::numeric),sum((value->>'tax_amount')::numeric) INTO v_sub,v_tax FROM jsonb_array_elements(v_items);
 SELECT value INTO v_sc FROM public.system_settings WHERE key='service_charge';
 v_sc:=COALESCE(v_sc,'{"type":"percentage","value":0}');
 IF v_sc->>'type' NOT IN ('percentage','flat') OR (v_sc->>'value')::numeric<0 OR (v_sc->>'value')::numeric>100000 THEN
   RAISE EXCEPTION 'Invalid service charge configuration' USING ERRCODE='22023'; END IF;
 v_charge:=CASE WHEN v_sc->>'type'='percentage' THEN round(v_sub*(v_sc->>'value')::numeric/100,2) ELSE round((v_sc->>'value')::numeric,2) END;
 IF p_order_id IS NULL THEN
   INSERT INTO public.orders(inventory_confirmed_at,confirmation_key,confirmation_hash,staff_id,table_id,order_type,status,source,confirmed_by,customer_name,customer_phone,customer_address,notes,subtotal,tax_amount,service_charge,total)
   VALUES(now(),v_key,v_hash,p_actor,v_table,v_type,'active',p_source,CASE WHEN p_source='qr' THEN p_actor END,p_payload->>'customer_name',p_payload->>'customer_phone',p_payload->>'customer_address',p_payload->>'notes',v_sub,v_tax,v_charge,v_sub+v_tax+v_charge) RETURNING * INTO o;
 ELSE
   UPDATE public.orders SET inventory_confirmed_at=CASE WHEN status<>'draft' THEN COALESCE(inventory_confirmed_at,now()) ELSE inventory_confirmed_at END,
    table_id=v_table,order_type=v_type,customer_name=p_payload->>'customer_name',customer_phone=p_payload->>'customer_phone',
    customer_address=p_payload->>'customer_address',notes=p_payload->>'notes',subtotal=v_sub,tax_amount=v_tax,service_charge=v_charge,discount_amount=0,total=v_sub+v_tax+v_charge
   WHERE id=p_order_id RETURNING * INTO o;
   DELETE FROM public.order_items WHERE order_id=o.id;
 END IF;
 INSERT INTO public.order_items(order_id,product_id,variant_label,quantity,unit_price,tax_rate,tax_amount,subtotal,notes,selected_modifiers)
 SELECT o.id,(x->>'product_id')::uuid,x->>'variant_label',(x->>'quantity')::integer,(x->>'unit_price')::numeric,
  (x->>'tax_rate')::numeric,(x->>'tax_amount')::numeric,(x->>'subtotal')::numeric,x->>'notes',x->'selected_modifiers' FROM jsonb_array_elements(v_items) x;
 IF o.inventory_confirmed_at IS NOT NULL THEN
   PERFORM public.sync_order_ingredients(o.id,p_actor,v_items,CASE WHEN p_order_id IS NULL THEN 'Order confirmed' ELSE 'Confirmed order updated' END);
 END IF;
 IF v_old_table IS DISTINCT FROM v_table THEN PERFORM public.refresh_table_occupancy(v_old_table); END IF;
 IF v_table IS NOT NULL THEN UPDATE public.tables SET status='occupied' WHERE id=v_table; END IF;
 INSERT INTO public.activity_logs(user_id,action,entity_type,entity_id,details)
 VALUES(p_actor,CASE WHEN p_order_id IS NULL THEN 'CREATE_ORDER' ELSE 'MODIFY_ORDER' END,'order',o.id::text,jsonb_build_object('total',o.total));
 RETURN to_jsonb(o)-'confirmation_hash';
END $$;

CREATE OR REPLACE FUNCTION public.claim_agent_job() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j public.agent_jobs; snapshot jsonb;
BEGIN
 IF (SELECT value FROM public.system_settings WHERE key='agent_review_enabled') IS DISTINCT FROM 'true'::jsonb THEN RETURN NULL; END IF;
 IF pg_try_advisory_xact_lock(hashtextextended('refresh_ingredient_reviews',0)) THEN
   PERFORM public.refresh_ingredient_reviews();
 END IF;
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

CREATE OR REPLACE FUNCTION public.agent_order_context(p_order uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER STABLE SET search_path=public,pg_temp AS $$
 WITH ticket AS (
   SELECT * FROM public.orders WHERE id=p_order
 ), usage AS (
   SELECT m.ingredient_id,m.quantity AS required
   FROM public.order_stock_movements m JOIN ticket t ON t.id=m.order_id
   WHERE t.inventory_confirmed_at IS NOT NULL AND m.reversed_at IS NULL
   UNION ALL
   SELECT pi.ingredient_id,sum(oi.quantity*pi.quantity_used)
   FROM ticket t JOIN public.order_items oi ON oi.order_id=t.id
   JOIN public.product_ingredients pi ON pi.product_id=oi.product_id
   WHERE t.inventory_confirmed_at IS NULL GROUP BY pi.ingredient_id
 )
 SELECT jsonb_build_object(
  'order',jsonb_build_object('id',o.id,'status',o.status,'created_at',o.created_at,'updated_at',o.updated_at,
    'source',o.source,'stock_confirmed',o.inventory_confirmed_at IS NOT NULL),
  'products',COALESCE((SELECT jsonb_agg(x.data ORDER BY x.product_id) FROM (
    SELECT oi.product_id,jsonb_build_object('id',oi.product_id,'name',left(COALESCE(p.name,'Deleted menu item'),300),
      'quantity',sum(oi.quantity),'available',COALESCE(p.is_available AND NOT p.is_86d,false),
      'has_variants',COALESCE(p.price_variants IS NOT NULL AND p.price_variants<>'[]'::jsonb,false),
      'has_modifiers',bool_or(CASE WHEN jsonb_typeof(oi.selected_modifiers)='array' THEN jsonb_array_length(oi.selected_modifiers)>0 ELSE false END),
      'has_recipe',CASE WHEN o.inventory_confirmed_at IS NOT NULL THEN COALESCE(s.recipe<>'{}'::jsonb,false)
        ELSE EXISTS(SELECT 1 FROM public.product_ingredients pi WHERE pi.product_id=oi.product_id) END,
      'makeable',public.recipe_yield(oi.product_id)) data
    FROM public.order_items oi LEFT JOIN public.products p ON p.id=oi.product_id
    LEFT JOIN public.order_recipe_snapshots s ON s.order_id=o.id AND s.product_id=oi.product_id
    WHERE oi.order_id=o.id GROUP BY oi.product_id,p.id,s.recipe
  )x),'[]'::jsonb),
  'ingredients',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'name',left(i.name,300),'unit',left(i.unit,50),
      'on_hand',i.quantity_available,'threshold',i.reorder_threshold,'required',use.required,
      'open_demand',(SELECT COALESCE(sum(oi.quantity*pi.quantity_used),0)
        FROM public.product_ingredients pi JOIN public.order_items oi ON oi.product_id=pi.product_id
        JOIN public.orders open_order ON open_order.id=oi.order_id
        WHERE pi.ingredient_id=i.id AND open_order.status IN ('active','billed') AND open_order.inventory_confirmed_at IS NULL))
    ORDER BY i.id) FROM usage use JOIN public.ingredients i ON i.id=use.ingredient_id),'[]'::jsonb)
 ) FROM ticket o
$$;

CREATE OR REPLACE FUNCTION public.void_order(p_order_id uuid,p_reason text,p_approved_by uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_admin boolean; o public.orders; v record;
BEGIN
 v_admin:=public.assert_actor(p_approved_by,'orders','void');
 SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='P0002'; END IF;
 IF NOT v_admin AND o.staff_id IS DISTINCT FROM p_approved_by THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF o.status NOT IN ('draft','active','billed','paid') THEN RAISE EXCEPTION 'Order is already closed' USING ERRCODE='40001'; END IF;
 IF length(trim(p_reason)) NOT BETWEEN 5 AND 300 THEN RAISE EXCEPTION 'Void reason must be 5-300 characters' USING ERRCODE='22023'; END IF;
 -- Old deduction records contain requested quantities, which may have been clamped.
 -- Do not invent a historical stock movement or silently refund without reversing it.
 IF o.status='paid' AND o.inventory_confirmed_at IS NULL AND EXISTS(SELECT 1 FROM public.stock_transactions WHERE reference_id=o.id AND type='deduction')
    AND NOT EXISTS(SELECT 1 FROM public.order_stock_movements WHERE order_id=o.id) THEN
   RAISE EXCEPTION 'Historical stock deductions require reconciliation before voiding this order' USING ERRCODE='40001';
 END IF;
 IF o.table_id IS NOT NULL THEN PERFORM 1 FROM public.tables WHERE id=o.table_id FOR UPDATE; END IF;
 FOR v IN SELECT * FROM public.order_stock_movements WHERE order_id=o.id AND reversed_at IS NULL ORDER BY ingredient_id FOR UPDATE LOOP
   UPDATE public.ingredients SET quantity_available=quantity_available+v.quantity WHERE id=v.ingredient_id;
   UPDATE public.order_stock_movements SET reversed_at=now() WHERE order_id=o.id AND ingredient_id=v.ingredient_id;
   INSERT INTO public.stock_transactions(ingredient_id,type,quantity,reference_id,performed_by,notes) VALUES(v.ingredient_id,'adjustment',v.quantity,o.id,p_approved_by,'Voided order reversal');
 END LOOP;
 UPDATE public.orders SET status='void',void_reason=trim(p_reason),void_approved_by=p_approved_by WHERE id=o.id;
 UPDATE public.payments SET status='refunded' WHERE order_id=o.id AND status='completed';
 PERFORM public.refresh_table_occupancy(o.table_id);
 INSERT INTO public.activity_logs(user_id,action,entity_type,entity_id,details) VALUES(p_approved_by,'VOID_ORDER','order',o.id::text,jsonb_build_object('reason',p_reason,'previous_status',o.status));
END $$;

REVOKE ALL ON FUNCTION public.record_ingredient_change(), public.refresh_ingredient_reviews(),
  public.sync_order_ingredients(uuid,uuid,jsonb,text), public.recipe_yield(uuid),
  public.add_raw_ingredient(uuid,text,text,numeric,numeric),
  public.update_ingredient_stock(uuid,uuid,numeric,numeric,timestamptz,text),
  public.save_ingredient_recipe(uuid,uuid,jsonb,jsonb), public.inventory_workspace(uuid),
  public.inventory_question_facts(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.add_raw_ingredient(uuid,text,text,numeric,numeric),
  public.update_ingredient_stock(uuid,uuid,numeric,numeric,timestamptz,text),
  public.save_ingredient_recipe(uuid,uuid,jsonb,jsonb), public.inventory_workspace(uuid),
  public.inventory_question_facts(uuid,text) TO service_role;

COMMIT;
