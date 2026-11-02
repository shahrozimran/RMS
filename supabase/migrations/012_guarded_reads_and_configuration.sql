-- Active Admin checks also protect direct authenticated browser report RPCs.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_staff_sales_summary(
  p_staff_id  UUID,
  p_from_date TIMESTAMPTZ DEFAULT now() - INTERVAL '30 days',
  p_to_date   TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  orders_count   BIGINT,
  total_revenue  NUMERIC,
  avg_order_value NUMERIC,
  void_count     BIGINT
) AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_admin() THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
  IF p_from_date IS NULL OR p_to_date IS NULL OR p_to_date<p_from_date OR p_to_date-p_from_date>interval '366 days' THEN RAISE EXCEPTION 'Report range must be at most 366 days' USING ERRCODE='22023'; END IF;

  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE status = 'paid')                AS orders_count,
    COALESCE(SUM(total) FILTER (WHERE status = 'paid'), 0) AS total_revenue,
    COALESCE(AVG(total) FILTER (WHERE status = 'paid'), 0) AS avg_order_value,
    COUNT(*) FILTER (WHERE status = 'void')                AS void_count
  FROM orders
  WHERE staff_id   = p_staff_id
    AND created_at BETWEEN p_from_date AND p_to_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp;

CREATE OR REPLACE FUNCTION public.get_order_analytics(
  p_from_date TIMESTAMPTZ DEFAULT now() - INTERVAL '30 days',
  p_to_date   TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  day            DATE,
  orders_count   BIGINT,
  revenue        NUMERIC,
  tax_collected  NUMERIC,
  avg_order_val  NUMERIC
) AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_admin() THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
  IF p_from_date IS NULL OR p_to_date IS NULL OR p_to_date<p_from_date OR p_to_date-p_from_date>interval '366 days' THEN RAISE EXCEPTION 'Report range must be at most 366 days' USING ERRCODE='22023'; END IF;

  RETURN QUERY
  SELECT
    DATE(created_at)                    AS day,
    COUNT(*)                            AS orders_count,
    COALESCE(SUM(total), 0)             AS revenue,
    COALESCE(SUM(tax_amount), 0)        AS tax_collected,
    COALESCE(AVG(total), 0)             AS avg_order_val
  FROM orders
  WHERE status = 'paid'
    AND created_at BETWEEN p_from_date AND p_to_date
  GROUP BY DATE(created_at)
  ORDER BY DATE(created_at);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp;

CREATE OR REPLACE FUNCTION public.get_top_items(
  p_limit     INT          DEFAULT 10,
  p_from_date TIMESTAMPTZ  DEFAULT now() - INTERVAL '30 days',
  p_to_date   TIMESTAMPTZ  DEFAULT now()
)
RETURNS TABLE (
  product_id   UUID,
  product_name TEXT,
  qty_sold     BIGINT,
  revenue      NUMERIC
) AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_admin() THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
  IF p_from_date IS NULL OR p_to_date IS NULL OR p_to_date<p_from_date OR p_to_date-p_from_date>interval '366 days' THEN RAISE EXCEPTION 'Report range must be at most 366 days' USING ERRCODE='22023'; END IF;
  IF p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid item limit' USING ERRCODE='22023'; END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    SUM(oi.quantity)::BIGINT   AS qty_sold,
    SUM(oi.subtotal)            AS revenue
  FROM order_items oi
  JOIN products p   ON p.id = oi.product_id
  JOIN orders   o   ON o.id = oi.order_id
  WHERE o.status = 'paid'
    AND o.created_at BETWEEN p_from_date AND p_to_date
  GROUP BY p.id, p.name
  ORDER BY qty_sold DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp;

CREATE OR REPLACE FUNCTION public.get_payment_method_split(
  p_from_date TIMESTAMPTZ DEFAULT now() - INTERVAL '30 days',
  p_to_date   TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  method  TEXT,
  count   BIGINT,
  total   NUMERIC
) AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_admin() THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
  IF p_from_date IS NULL OR p_to_date IS NULL OR p_to_date<p_from_date OR p_to_date-p_from_date>interval '366 days' THEN RAISE EXCEPTION 'Report range must be at most 366 days' USING ERRCODE='22023'; END IF;

  RETURN QUERY
  SELECT
    p.method,
    COUNT(*)       AS count,
    SUM(p.amount)  AS total
  FROM payments p
  JOIN orders   o ON o.id = p.order_id
  WHERE o.status = 'paid'
    AND p.paid_at BETWEEN p_from_date AND p_to_date
  GROUP BY p.method
  ORDER BY total DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp;

GRANT EXECUTE ON FUNCTION public.get_staff_sales_summary(uuid,timestamptz,timestamptz), public.get_order_analytics(timestamptz,timestamptz), public.get_top_items(integer,timestamptz,timestamptz), public.get_payment_method_split(timestamptz,timestamptz) TO authenticated;

CREATE FUNCTION public.revoke_staff_sessions(p_user_id uuid,p_expected_version integer) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 UPDATE public.users SET session_version=session_version+1 WHERE id=p_user_id AND auth_user_id IS NULL AND session_version=p_expected_version
$$;

CREATE FUNCTION public.get_pos_catalog() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object(
  'categories',COALESCE((SELECT jsonb_agg(c ORDER BY c.sort_order,c.id) FROM public.categories c),'[]'),
  'products',COALESCE((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('modifiers',
    COALESCE((SELECT jsonb_agg(m ORDER BY m.id) FROM public.modifiers m WHERE m.product_id=p.id AND m.is_active),'[]')) ORDER BY p.name)
    FROM public.products p WHERE p.is_available AND NOT p.is_86d),'[]'),
  'tables',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',t.id,'table_number',t.table_number,'section',t.section,'capacity',t.capacity,'status',t.status) ORDER BY t.id) FROM public.tables t),'[]'),
  'settings',COALESCE((SELECT jsonb_object_agg(key,value) FROM public.system_settings WHERE key IN ('currency','service_charge')),'{}'))
$$;

CREATE FUNCTION public.configure_tables(p_actor uuid,p_count integer) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_count integer; v_number integer:=1; v_remove integer[]; v_id integer;
BEGIN
 PERFORM public.assert_actor(p_actor,'settings','write');
 IF p_count NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Table count must be 1-200' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(8401101);
 PERFORM 1 FROM public.tables ORDER BY id FOR UPDATE;
 SELECT count(*) INTO v_count FROM public.tables;
 IF v_count>p_count THEN
   SELECT array_agg(id) INTO v_remove FROM (SELECT t.id FROM public.tables t WHERE t.status='free'
    AND NOT EXISTS(SELECT 1 FROM public.orders o WHERE o.table_id=t.id AND o.status IN ('draft','active','billed'))
    AND NOT EXISTS(SELECT 1 FROM public.qr_pending_orders q WHERE q.table_id=t.id AND q.status='pending')
    ORDER BY t.id DESC LIMIT v_count-p_count) x;
   IF COALESCE(array_length(v_remove,1),0)<>v_count-p_count THEN RAISE EXCEPTION 'Cannot remove occupied or pending-order tables' USING ERRCODE='40001'; END IF;
   DELETE FROM public.tables WHERE id=ANY(v_remove);
 ELSE
   WHILE v_count<p_count LOOP
     WHILE EXISTS(SELECT 1 FROM public.tables WHERE table_number='T'||v_number) LOOP v_number:=v_number+1; END LOOP;
     INSERT INTO public.tables(table_number,section,capacity) VALUES('T'||v_number,'Main Hall',4) RETURNING id INTO v_id;
     v_count:=v_count+1;
   END LOOP;
 END IF;
 INSERT INTO public.system_settings(key,value,updated_by) VALUES('table_count',jsonb_build_object('count',p_count),p_actor)
 ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value,updated_by=p_actor,updated_at=now();
 INSERT INTO public.activity_logs(user_id,action,entity_type,details) VALUES(p_actor,'CONFIGURE_TABLES','tables',jsonb_build_object('count',p_count));
 RETURN format('Tables adjusted to %s total',p_count);
END $$;

CREATE FUNCTION public.mutate_table(p_actor uuid,p_table integer,p_status text DEFAULT NULL,p_capacity integer DEFAULT NULL,p_regenerate boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_admin boolean; t public.tables;
BEGIN
 v_admin:=public.assert_actor(p_actor,'orders','write');
 IF p_capacity IS NOT NULL OR p_regenerate THEN PERFORM public.assert_actor(p_actor,'settings','write'); END IF;
 SELECT * INTO t FROM public.tables WHERE id=p_table FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Table not found' USING ERRCODE='P0002'; END IF;
 IF p_capacity IS NOT NULL AND p_capacity NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Invalid capacity' USING ERRCODE='22023'; END IF;
 IF p_status IS NOT NULL AND p_status NOT IN ('free','occupied','reserved','cleaning') THEN RAISE EXCEPTION 'Invalid status' USING ERRCODE='22023'; END IF;
 IF p_status IN ('free','reserved','cleaning') AND EXISTS(SELECT 1 FROM public.orders WHERE table_id=t.id AND status IN ('draft','active','billed')) THEN
  RAISE EXCEPTION 'Table has an open order' USING ERRCODE='40001'; END IF;
 UPDATE public.tables SET status=COALESCE(p_status,status),capacity=COALESCE(p_capacity,capacity),qr_token=CASE WHEN p_regenerate THEN gen_random_uuid() ELSE qr_token END WHERE id=t.id RETURNING * INTO t;
 INSERT INTO public.activity_logs(user_id,action,entity_type,entity_id) VALUES(p_actor,'UPDATE_TABLE','table',t.id::text);
 RETURN CASE WHEN v_admin THEN to_jsonb(t) ELSE to_jsonb(t)-'qr_token' END;
END $$;

CREATE FUNCTION public.get_staff_performance() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_admin() THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
 WITH sales AS (
  SELECT staff_id,count(*) FILTER(WHERE status='paid') paid,sum(total) FILTER(WHERE status='paid') revenue FROM public.orders GROUP BY staff_id
 ), confirmed AS (
  SELECT confirmed_by,count(*) n FROM public.orders WHERE source='qr' GROUP BY confirmed_by
 ), rejected AS (
  SELECT user_id,count(*) n FROM public.activity_logs WHERE action='REJECT_QR_ORDER' GROUP BY user_id
 )
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'username',u.username,'role',r.name,'status',u.status,
  'isOnDuty',EXISTS(SELECT 1 FROM public.shifts WHERE staff_id=u.id AND clock_out IS NULL),
  'activeShiftSince',(SELECT clock_in FROM public.shifts WHERE staff_id=u.id AND clock_out IS NULL),
  'ordersProcessed',COALESCE(s.paid,0),'totalRevenue',COALESCE(s.revenue,0),'qrConfirmed',COALESCE(c.n,0),'qrRejected',COALESCE(j.n,0),
  'shiftLogs',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',h.id,'clockIn',h.clock_in,'clockOut',h.clock_out) ORDER BY h.clock_in DESC)
   FROM (SELECT id,clock_in,clock_out FROM public.shifts WHERE staff_id=u.id ORDER BY clock_in DESC LIMIT 10) h),'[]')) ORDER BY u.name),'[]') INTO result
 FROM public.users u LEFT JOIN public.roles r ON r.id=u.role_id LEFT JOIN sales s ON s.staff_id=u.id LEFT JOIN confirmed c ON c.confirmed_by=u.id LEFT JOIN rejected j ON j.user_id=u.id
 WHERE u.auth_user_id IS NULL AND u.status<>'deleted';
 RETURN result;
END $$;

CREATE FUNCTION public.get_staff_leaderboard(p_from_date timestamptz,p_to_date timestamptz) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_admin() THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
 IF p_from_date IS NULL OR p_to_date IS NULL OR p_to_date<p_from_date OR p_to_date-p_from_date>interval '366 days' THEN RAISE EXCEPTION 'Report range must be at most 366 days' USING ERRCODE='22023'; END IF;
 SELECT COALESCE(jsonb_agg(x ORDER BY x.total_revenue DESC),'[]') INTO result FROM (
  SELECT u.name,u.username,count(o.id) orders_count,COALESCE(sum(o.total),0) total_revenue,COALESCE(avg(o.total),0) avg_order_value
  FROM public.users u LEFT JOIN public.orders o ON o.staff_id=u.id AND o.status='paid' AND o.created_at BETWEEN p_from_date AND p_to_date
  WHERE u.auth_user_id IS NULL AND u.status<>'deleted' GROUP BY u.id
 ) x;
 RETURN result;
END $$;

CREATE FUNCTION public.get_staff_dashboard(p_actor uuid,p_from_date timestamptz) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM public.assert_actor(p_actor,'orders','write');
 RETURN jsonb_build_object('todayRevenue',COALESCE((SELECT sum(total) FROM public.orders WHERE staff_id=p_actor AND status='paid' AND created_at>=p_from_date),0),
 'todayOrderCount',(SELECT count(*) FROM public.orders WHERE staff_id=p_actor AND status='paid' AND created_at>=p_from_date));
END $$;

-- Direct authenticated browser mutations must not bypass audited API transactions.
REVOKE INSERT,UPDATE,DELETE ON public.tables,public.system_settings FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.revoke_staff_sessions(uuid,integer), public.get_pos_catalog(), public.configure_tables(uuid,integer),
 public.mutate_table(uuid,integer,text,integer,boolean),public.get_staff_performance(),public.get_staff_leaderboard(timestamptz,timestamptz),public.get_staff_dashboard(uuid,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_staff_sessions(uuid,integer), public.get_pos_catalog(), public.configure_tables(uuid,integer),
 public.mutate_table(uuid,integer,text,integer,boolean),public.get_staff_performance(),public.get_staff_leaderboard(timestamptz,timestamptz),public.get_staff_dashboard(uuid,timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_staff_leaderboard(timestamptz,timestamptz) TO authenticated;
CREATE FUNCTION public.get_admin_dashboard(p_from_date timestamptz) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_admin() THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object(
 'todayRevenue',COALESCE((SELECT sum(total) FROM public.orders WHERE status='paid' AND created_at>=p_from_date),0),
 'todayOrderCount',(SELECT count(*) FROM public.orders WHERE status='paid' AND created_at>=p_from_date),
 'activeOrderCount',(SELECT count(*) FROM public.orders WHERE status IN ('active','billed')),
 'staffCount',(SELECT count(*) FROM public.users WHERE status='active' AND auth_user_id IS NULL),
 'topItems',COALESCE((SELECT jsonb_agg(x) FROM public.get_top_items(5) x),'[]'),
 'activeOrders',COALESCE((SELECT jsonb_agg(x) FROM (SELECT o.id,o.status,o.order_type,o.total,o.created_at,
  jsonb_build_object('name',u.name) staff,jsonb_build_object('table_number',t.table_number) AS "table"
  FROM public.orders o LEFT JOIN public.users u ON u.id=o.staff_id LEFT JOIN public.tables t ON t.id=o.table_id
  WHERE o.status IN ('active','billed') ORDER BY o.created_at DESC LIMIT 200) x),'[]'),
 'recentOrders',COALESCE((SELECT jsonb_agg(x) FROM (SELECT o.id,o.status,o.order_type,o.total,o.created_at,
  jsonb_build_object('name',u.name) staff,jsonb_build_object('table_number',t.table_number) AS "table"
  FROM public.orders o LEFT JOIN public.users u ON u.id=o.staff_id LEFT JOIN public.tables t ON t.id=o.table_id
  ORDER BY o.created_at DESC LIMIT 8) x),'[]'),
 'currency',COALESCE((SELECT value FROM public.system_settings WHERE key='currency'),'{"code":"USD","symbol":"$","locale":"en-US"}'));
END $$;
REVOKE EXECUTE ON FUNCTION public.get_admin_dashboard(timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard(timestamptz) TO service_role;
CREATE FUNCTION public.get_qr_menu(p_token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t public.tables; settings jsonb;
BEGIN
 SELECT * INTO t FROM public.tables WHERE qr_token=p_token;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invalid QR code' USING ERRCODE='P0002'; END IF;
 SELECT jsonb_object_agg(key,value) INTO settings FROM public.system_settings WHERE key IN ('restaurant_name','currency','service_charge');
 RETURN jsonb_build_object('table',to_jsonb(t)-'qr_token',
 'categories',COALESCE((SELECT jsonb_agg(c ORDER BY c.sort_order,c.id) FROM (SELECT id,name,description,sort_order FROM public.categories) c),'[]'),
 'products',COALESCE((SELECT jsonb_agg(p ORDER BY p.name) FROM (SELECT id,name,description,base_price,price_variants,tax_rate,image_url,category_id
   FROM public.products WHERE is_available AND NOT is_86d) p),'[]'),
 'settings',COALESCE(settings,'{}'));
END $$;
REVOKE EXECUTE ON FUNCTION public.get_qr_menu(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_qr_menu(uuid) TO service_role;
COMMIT;
