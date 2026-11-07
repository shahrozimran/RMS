BEGIN;

CREATE TABLE public.agent_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asked_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  question text NOT NULL CHECK (length(question) BETWEEN 5 AND 800),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','answered','no_evidence','failed')),
  answer text CHECK (length(answer)<=2400),
  sources jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(sources)='array' AND octet_length(sources::text)<=24000),
  model text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX agent_questions_owner_recent ON public.agent_questions(asked_by,created_at DESC);

CREATE TABLE public.team_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  recipient_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('staff_message','issue','check_failed')),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  message text NOT NULL CHECK (length(message) BETWEEN 1 AND 1000),
  issue_id uuid REFERENCES public.agent_recommendations(id) ON DELETE SET NULL,
  system_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  UNIQUE(recipient_id,system_ref)
);
CREATE INDEX team_alert_inbox ON public.team_alerts(recipient_id,created_at DESC);
CREATE INDEX team_alert_unread ON public.team_alerts(recipient_id) WHERE read_at IS NULL;
CREATE INDEX team_alert_sent ON public.team_alerts(sender_id,created_at DESC) WHERE sender_id IS NOT NULL;

ALTER TABLE public.agent_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_questions,public.team_alerts FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.agent_questions TO service_role;
GRANT SELECT ON public.team_alerts TO service_role;

CREATE FUNCTION public.send_team_alert(p_actor uuid,p_id uuid,p_recipient uuid,p_title text,p_message text,p_issue uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE inserted uuid;
BEGIN
  IF NOT public.assert_actor(p_actor,'reports','read') THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
  IF p_id IS NULL OR COALESCE(length(trim(p_title)),0) NOT BETWEEN 1 AND 120
    OR COALESCE(length(trim(p_message)),0) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'Enter a title and message' USING ERRCODE='22023';
  END IF;
  -- A repeated delivery with the same request ID returns the existing record.
  IF EXISTS(SELECT 1 FROM public.team_alerts WHERE id=p_id AND sender_id=p_actor AND recipient_id=p_recipient
    AND title=trim(p_title) AND message=trim(p_message) AND issue_id IS NOT DISTINCT FROM p_issue) THEN RETURN p_id; END IF;
  PERFORM 1 FROM public.users u JOIN public.roles r ON r.id=u.role_id
    WHERE u.id=p_recipient AND u.status='active' AND u.auth_user_id IS NULL AND r.name<>'Admin' FOR SHARE OF u;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose an active team member' USING ERRCODE='22023'; END IF;
  IF p_issue IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.agent_recommendations WHERE id=p_issue) THEN
    RAISE EXCEPTION 'The linked issue was not found' USING ERRCODE='P0002';
  END IF;
  INSERT INTO public.team_alerts(id,sender_id,recipient_id,kind,title,message,issue_id)
    VALUES(p_id,p_actor,p_recipient,'staff_message',trim(p_title),trim(p_message),p_issue)
    ON CONFLICT(id) DO NOTHING RETURNING id INTO inserted;
  IF inserted IS NULL THEN
    IF EXISTS(SELECT 1 FROM public.team_alerts WHERE id=p_id AND sender_id=p_actor AND recipient_id=p_recipient
      AND title=trim(p_title) AND message=trim(p_message) AND issue_id IS NOT DISTINCT FROM p_issue) THEN RETURN p_id; END IF;
    RAISE EXCEPTION 'Alert request already used' USING ERRCODE='40001';
  END IF;
  INSERT INTO public.activity_logs(user_id,action,entity_type,entity_id)
    VALUES(p_actor,'TEAM_ALERT_SENT','team_alert',p_id::text);
  RETURN inserted;
END $$;

CREATE FUNCTION public.read_team_alert(p_actor uuid,p_id uuid) RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE opened timestamptz;
BEGIN
  PERFORM 1 FROM public.users WHERE id=p_actor AND status='active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account unavailable' USING ERRCODE='42501'; END IF;
  UPDATE public.team_alerts SET read_at=COALESCE(read_at,now()) WHERE id=p_id AND recipient_id=p_actor RETURNING read_at INTO opened;
  IF NOT FOUND THEN RAISE EXCEPTION 'Alert not found' USING ERRCODE='P0002'; END IF;
  RETURN opened;
END $$;

CREATE FUNCTION public.notify_admin_of_help_desk_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE alert_kind text; alert_title text; alert_message text; alert_ref text; linked_issue uuid;
BEGIN
  IF TG_TABLE_NAME='agent_recommendations' THEN
    alert_kind:='issue'; alert_title:=left(NEW.title,120); alert_message:=left(NEW.summary,1000);
    alert_ref:='issue:'||NEW.id; linked_issue:=NEW.id;
  ELSE
    alert_kind:='check_failed'; alert_title:='An order check needs a retry';
    alert_message:='The check could not finish for order #'||upper(right(NEW.order_id::text,6))||'. Open Checks to retry it.';
    alert_ref:='check:'||NEW.id||':'||NEW.generation;
  END IF;
  INSERT INTO public.team_alerts(recipient_id,kind,title,message,issue_id,system_ref)
    SELECT u.id,alert_kind,alert_title,alert_message,linked_issue,alert_ref
    FROM public.users u JOIN public.roles r ON r.id=u.role_id
    WHERE u.status='active' AND u.auth_user_id IS NOT NULL AND r.name='Admin'
    ON CONFLICT(recipient_id,system_ref) DO NOTHING;
  RETURN NEW;
END $$;

CREATE TRIGGER alert_admin_on_priority_issue AFTER INSERT ON public.agent_recommendations
  FOR EACH ROW WHEN (NEW.severity='high' AND NEW.status='open') EXECUTE FUNCTION public.notify_admin_of_help_desk_event();
CREATE TRIGGER alert_admin_on_failed_check AFTER UPDATE OF status ON public.agent_jobs
  FOR EACH ROW WHEN (NEW.status='dead' AND OLD.status IS DISTINCT FROM NEW.status) EXECUTE FUNCTION public.notify_admin_of_help_desk_event();

CREATE FUNCTION public.help_desk_question_facts(p_actor uuid,p_question text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE terms tsquery; results jsonb; policies jsonb;
BEGIN
  IF NOT public.assert_actor(p_actor,'reports','read') THEN RAISE EXCEPTION 'Administrator access required' USING ERRCODE='42501'; END IF;
  SELECT to_tsquery('english', string_agg(quote_literal(word),' | ')) INTO terms
    FROM unnest(tsvector_to_array(to_tsvector('english',left(p_question,800)))) AS word WHERE length(word)>2;
  SELECT COALESCE(jsonb_agg(to_jsonb(f)),'[]') INTO results FROM (
    SELECT 'I-'||id AS id,'live' AS kind,left(title,160) AS title,
      left(summary,850)||' Order #'||upper(right(order_id::text,6))||'.' AS excerpt
    FROM (SELECT id,title,summary,order_id,created_at FROM public.agent_recommendations
      WHERE status='open' AND expires_at>now() ORDER BY created_at DESC LIMIT 200) recent
    WHERE to_tsvector('english',title||' '||summary) @@ terms
    ORDER BY ts_rank(to_tsvector('english',title||' '||summary),terms) DESC,created_at DESC LIMIT 3
  ) f;
  SELECT COALESCE(jsonb_agg(to_jsonb(p)),'[]') INTO policies FROM (
    SELECT 'D-'||c.id AS id,'document' AS kind,d.title,left(c.body,900) AS excerpt,
      d.id AS "documentId",c.position AS chunk
    FROM public.agent_knowledge_chunks c JOIN public.agent_knowledge_documents d ON d.id=c.document_id
    WHERE d.archived_at IS NULL AND to_tsvector('english',c.body) @@ terms
    ORDER BY ts_rank(to_tsvector('english',c.body),terms) DESC,c.id LIMIT 2
  ) p;
  results:=results||policies;
  IF p_question ~* '\m(orders?|tickets?)\M' THEN
    results:=results||jsonb_build_array(jsonb_build_object('id','F-open-orders','kind','live','title','Open orders now',
      'excerpt',format('%s orders are active or awaiting payment.',(SELECT count(*) FROM public.orders WHERE status IN ('active','billed')))));
  END IF;
  IF p_question ~* '\m(tables?|seats?|floor)\M' THEN
    results:=results||jsonb_build_array(jsonb_build_object('id','F-tables','kind','live','title','Tables now',
      'excerpt',format('%s free, %s occupied, %s reserved and %s being cleaned.',
        (SELECT count(*) FROM public.tables WHERE status='free'),(SELECT count(*) FROM public.tables WHERE status='occupied'),
        (SELECT count(*) FROM public.tables WHERE status='reserved'),(SELECT count(*) FROM public.tables WHERE status='cleaning'))));
  END IF;
  IF p_question ~* '\m(shifts?|staff|waiters?)\M' THEN
    results:=results||jsonb_build_array(jsonb_build_object('id','F-shifts','kind','live','title','Staff on shift',
      'excerpt',format('%s active staff members are clocked in.',(SELECT count(*) FROM public.shifts s JOIN public.users u ON u.id=s.staff_id WHERE s.clock_out IS NULL AND u.status='active'))));
  END IF;
  RETURN results;
END $$;

DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid::regprocedure signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('send_team_alert','read_team_alert','notify_admin_of_help_desk_event','help_desk_question_facts')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
  END LOOP;
END $$;
COMMIT;
