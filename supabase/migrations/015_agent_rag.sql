BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
SET LOCAL search_path=public,extensions,pg_catalog;

CREATE TABLE public.agent_rag_control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 0,
  budget_day date NOT NULL DEFAULT ((now() AT TIME ZONE 'UTC')::date),
  used integer NOT NULL DEFAULT 0 CHECK (used BETWEEN 0 AND 30)
);
INSERT INTO public.agent_rag_control DEFAULT VALUES;

CREATE TABLE public.agent_knowledge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  scope text NOT NULL CHECK (scope IN ('all','order','inventory','kitchen','staff','tables','sales','supervisor')),
  digest text NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
  chunk_count integer NOT NULL CHECK (chunk_count BETWEEN 1 AND 45),
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE UNIQUE INDEX agent_knowledge_active_digest ON public.agent_knowledge_documents(scope,digest) WHERE archived_at IS NULL;

CREATE TABLE public.agent_knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.agent_knowledge_documents(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position BETWEEN 1 AND 45),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 1100),
  embedding vector(768) NOT NULL,
  keywords tsvector GENERATED ALWAYS AS (to_tsvector('simple',body)) STORED,
  UNIQUE(document_id,position)
);

ALTER TABLE public.agent_runs ADD COLUMN ai_review jsonb;
ALTER TABLE public.agent_runs ADD CONSTRAINT agent_runs_ai_review_size
  CHECK (ai_review IS NULL OR (jsonb_typeof(ai_review)='object' AND octet_length(ai_review::text)<=49152));

ALTER TABLE public.agent_rag_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_knowledge_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_knowledge_chunks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_rag_control, public.agent_knowledge_documents, public.agent_knowledge_chunks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.agent_rag_control, public.agent_knowledge_documents, public.agent_knowledge_chunks TO service_role;

CREATE FUNCTION public.import_agent_knowledge(p_actor uuid,p_title text,p_scope text,p_digest text,p_chunks jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,extensions,pg_temp AS $$
DECLARE doc_id uuid; part jsonb; idx integer:=0;
BEGIN
  IF NOT public.assert_actor(p_actor,'reports','read') THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_chunks) IS DISTINCT FROM 'array' OR jsonb_array_length(p_chunks) NOT BETWEEN 1 AND 45
    OR octet_length(p_chunks::text)>1100000 THEN RAISE EXCEPTION 'Invalid knowledge chunks' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.agent_rag_control FOR UPDATE;
  IF (SELECT count(*) FROM public.agent_knowledge_documents WHERE archived_at IS NULL)>=100 THEN
    RAISE EXCEPTION 'Archive a document before adding another' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.agent_knowledge_documents(title,scope,digest,chunk_count,created_by)
    VALUES(trim(p_title),p_scope,p_digest,jsonb_array_length(p_chunks),p_actor) RETURNING id INTO doc_id;
  FOR part IN SELECT value FROM jsonb_array_elements(p_chunks) LOOP
    idx:=idx+1;
    INSERT INTO public.agent_knowledge_chunks(document_id,position,body,embedding)
      VALUES(doc_id,idx,part->>'body',(part->>'embedding')::vector(768));
  END LOOP;
  UPDATE public.agent_rag_control SET revision=revision+1;
  INSERT INTO public.activity_logs(user_id,action,entity_type,entity_id)
    VALUES(p_actor,'AGENT_KNOWLEDGE_IMPORTED','agent_knowledge',doc_id::text);
  RETURN doc_id;
END $$;

CREATE FUNCTION public.archive_agent_knowledge(p_actor uuid,p_document uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT public.assert_actor(p_actor,'reports','read') THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.agent_rag_control FOR UPDATE;
  UPDATE public.agent_knowledge_documents SET archived_at=now() WHERE id=p_document AND archived_at IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;
  -- Published reviews retain their cited excerpt. Archived text is removed from retrieval storage.
  DELETE FROM public.agent_knowledge_chunks WHERE document_id=p_document;
  UPDATE public.agent_rag_control SET revision=revision+1,
    enabled=enabled AND EXISTS(SELECT 1 FROM public.agent_knowledge_documents WHERE archived_at IS NULL);
  INSERT INTO public.activity_logs(user_id,action,entity_type,entity_id)
    VALUES(p_actor,'AGENT_KNOWLEDGE_ARCHIVED','agent_knowledge',p_document::text);
  RETURN true;
END $$;

CREATE FUNCTION public.set_agent_rag_enabled(p_actor uuid,p_enabled boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF NOT public.assert_actor(p_actor,'reports','read') THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.agent_rag_control FOR UPDATE;
  IF p_enabled AND NOT EXISTS(SELECT 1 FROM public.agent_knowledge_documents WHERE archived_at IS NULL) THEN
    RAISE EXCEPTION 'Add a knowledge document before enabling AI reviews' USING ERRCODE='22023';
  END IF;
  UPDATE public.agent_rag_control SET enabled=p_enabled,revision=revision+1;
  INSERT INTO public.activity_logs(user_id,action,entity_type,details)
    VALUES(p_actor,'AGENT_AI_CONFIGURED','agents',jsonb_build_object('enabled',p_enabled));
  RETURN p_enabled;
END $$;

CREATE FUNCTION public.search_agent_knowledge(p_queries jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public,extensions,pg_temp AS $$
BEGIN
  IF jsonb_typeof(p_queries) IS DISTINCT FROM 'array' OR jsonb_array_length(p_queries) NOT BETWEEN 1 AND 7
    OR octet_length(p_queries::text)>165000 THEN RAISE EXCEPTION 'Invalid retrieval query' USING ERRCODE='22023'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(to_jsonb(hit) ORDER BY hit.role,hit.score DESC,hit.id)
    FROM jsonb_to_recordset(p_queries) AS q(role text, terms text, embedding text)
    CROSS JOIN LATERAL (
      SELECT q.role,c.id,d.id AS document_id,d.title,c.position,c.body,
        (1-(c.embedding <=> q.embedding::vector(768))) +
          CASE WHEN c.keywords @@ websearch_to_tsquery('simple',left(q.terms,240)) THEN 0.20 ELSE 0 END AS score
      FROM public.agent_knowledge_chunks c JOIN public.agent_knowledge_documents d ON d.id=c.document_id
      WHERE d.archived_at IS NULL AND (d.scope='all' OR d.scope=q.role OR q.role='all')
        AND (c.embedding <=> q.embedding::vector(768)<0.55
          OR c.keywords @@ websearch_to_tsquery('simple',left(q.terms,240)))
      ORDER BY score DESC,c.id LIMIT 2
    ) hit),'[]'::jsonb);
END $$;

CREATE FUNCTION public.prepare_agent_ai_review(p_job uuid,p_lease uuid,p_generation integer,p_has_key boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE config public.agent_rag_control; target public.orders; today date:=(now() AT TIME ZONE 'UTC')::date;
BEGIN
  SELECT * INTO target FROM public.orders WHERE id=(SELECT order_id FROM public.agent_jobs
    WHERE id=p_job AND lease_token=p_lease AND generation=p_generation AND status='processing' AND locked_until>now());
  IF NOT FOUND OR target.status NOT IN ('active','billed') OR
    (SELECT value FROM public.system_settings WHERE key='agent_review_enabled') IS DISTINCT FROM 'true'::jsonb THEN
    RETURN jsonb_build_object('status','disabled');
  END IF;
  SELECT * INTO config FROM public.agent_rag_control FOR UPDATE;
  IF NOT config.enabled THEN RETURN jsonb_build_object('status','disabled'); END IF;
  IF p_has_key IS DISTINCT FROM true THEN RETURN jsonb_build_object('status','key_missing'); END IF;
  IF config.budget_day=today AND config.used>=30 THEN RETURN jsonb_build_object('status','budget_reached'); END IF;
  UPDATE public.agent_rag_control SET budget_day=today,used=CASE WHEN budget_day=today THEN used+1 ELSE 1 END;
  RETURN jsonb_build_object('status','ready','revision',config.revision,'facts',jsonb_build_object(
    'open_orders',(SELECT count(*) FROM public.orders WHERE status IN ('active','billed')),
    'kitchen_orders',(SELECT count(*) FROM public.orders WHERE status='active'),
    'oldest_active_at',(SELECT min(created_at) FROM public.orders WHERE status='active'),
    'staff_on_shift',(SELECT count(*) FROM public.shifts s JOIN public.users u ON u.id=s.staff_id WHERE s.clock_out IS NULL AND u.status='active'),
    'assigned_open_orders',(SELECT count(*) FROM public.orders WHERE staff_id=target.staff_id AND status IN ('active','billed')),
    'order_has_table',target.table_id IS NOT NULL,
    'table_status',(SELECT status FROM public.tables WHERE id=target.table_id),
    'table_capacity',(SELECT capacity FROM public.tables WHERE id=target.table_id),
    'floor',(SELECT jsonb_build_object('free',count(*) FILTER(WHERE status='free'),
      'occupied',count(*) FILTER(WHERE status='occupied'),'reserved',count(*) FILTER(WHERE status='reserved'),
      'cleaning',count(*) FILTER(WHERE status='cleaning')) FROM public.tables),
    'sales_days',30,
    'paid_orders',(SELECT count(*) FROM public.orders WHERE status='paid' AND created_at>=now()-interval '30 days'),
    'top_items',COALESCE((SELECT jsonb_agg(to_jsonb(s)) FROM (
      SELECT p.name,sum(i.quantity) AS quantity FROM public.orders o JOIN public.order_items i ON i.order_id=o.id
      JOIN public.products p ON p.id=i.product_id WHERE o.status='paid' AND o.created_at>=now()-interval '30 days'
      GROUP BY p.id,p.name ORDER BY sum(i.quantity) DESC,p.name LIMIT 5
    ) s),'[]'::jsonb)
  ));
END $$;

CREATE FUNCTION public.complete_agent_ai_job(p_job uuid,p_lease uuid,p_generation integer,p_hash text,p_rules jsonb,p_revision integer,p_review jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE config public.agent_rag_control;
BEGIN
  IF jsonb_typeof(p_review) IS DISTINCT FROM 'object' OR octet_length(p_review::text)>49152
    OR COALESCE(p_review->>'status','') NOT IN ('completed','fallback') THEN
    RAISE EXCEPTION 'Invalid AI review' USING ERRCODE='22023';
  END IF;
  IF p_review->>'status'='completed' AND (jsonb_typeof(p_review->'agents') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_review->'agents')<>7) THEN RAISE EXCEPTION 'Expected seven agent results' USING ERRCODE='22023'; END IF;
  SELECT * INTO config FROM public.agent_rag_control FOR SHARE;
  IF p_review->>'status'='completed' AND (NOT config.enabled OR config.revision IS DISTINCT FROM p_revision) THEN
    p_review:=jsonb_build_object('status','fallback','reason','knowledge_changed');
  END IF;
  IF NOT public.complete_agent_job(p_job,p_lease,p_generation,p_hash,p_rules) THEN RETURN false; END IF;
  UPDATE public.agent_runs SET ai_review=p_review WHERE job_id=p_job AND generation=p_generation;
  RETURN true;
END $$;

DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('import_agent_knowledge','archive_agent_knowledge','set_agent_rag_enabled',
      'search_agent_knowledge','prepare_agent_ai_review','complete_agent_ai_job')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
  END LOOP;
END $$;

COMMIT;
