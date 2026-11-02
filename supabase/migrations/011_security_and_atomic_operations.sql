-- Run after 001-010, before deploying the matching application code.
-- Financial mutations are service-only RPC transactions; browser reads retain RLS.
BEGIN;

ALTER TABLE public.users ADD COLUMN session_version integer NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX users_auth_identity_unique ON public.users(auth_user_id) WHERE auth_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.bump_session_version() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.password_hash IS DISTINCT FROM OLD.password_hash OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.role_id IS DISTINCT FROM OLD.role_id OR NEW.username IS DISTINCT FROM OLD.username THEN
    NEW.session_version := OLD.session_version + 1;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER users_revoke_sessions BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.bump_session_version();

-- Disable only identifiable demo credentials; never silently change real passwords.
UPDATE public.users SET status = 'suspended'
WHERE (auth_user_id IS NOT NULL AND email = 'admin@demo.com')
 OR (password_hash = '$2b$12$V.ORC6QnwMQsv6mLMABPR.VO76jzx88UTCWGz/DRjwCXzqHfXZqUO');

CREATE OR REPLACE FUNCTION public.get_my_role() RETURNS text
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
 SELECT r.name FROM public.users u JOIN public.roles r ON r.id=u.role_id
 WHERE u.auth_user_id=auth.uid() AND u.status='active' LIMIT 1
$$;
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
 SELECT COALESCE(public.get_my_role()='Admin',false)
$$;
CREATE OR REPLACE FUNCTION public.get_my_user_id() RETURNS uuid
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
 SELECT id FROM public.users WHERE auth_user_id=auth.uid() AND status='active' LIMIT 1
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON
 public.orders,public.order_items,public.payments,public.payment_splits,public.stock_transactions,
 public.ingredients,public.product_ingredients,public.qr_pending_orders,public.shifts,public.activity_logs
 FROM authenticated;
DROP POLICY IF EXISTS qr_pending_anon_insert ON public.qr_pending_orders;
DROP POLICY IF EXISTS tables_select_all ON public.tables;
CREATE POLICY tables_admin_read ON public.tables FOR SELECT TO authenticated USING(public.is_admin());
DROP POLICY IF EXISTS ingredients_select_all ON public.ingredients;
CREATE POLICY ingredients_admin_read ON public.ingredients FOR SELECT TO authenticated USING(public.is_admin());
DROP POLICY IF EXISTS product_ing_select_all ON public.product_ingredients;
CREATE POLICY recipe_admin_read ON public.product_ingredients FOR SELECT TO authenticated USING(public.is_admin());
DROP POLICY IF EXISTS stock_tx_staff_read ON public.stock_transactions;
DROP POLICY IF EXISTS settings_staff_read ON public.system_settings;
CREATE POLICY settings_admin_read ON public.system_settings FOR SELECT TO authenticated USING(public.is_admin());

-- Close duplicate open shifts left by the former check-then-insert route.
WITH duplicates AS (
 SELECT id,clock_in,row_number() OVER(PARTITION BY staff_id ORDER BY clock_in DESC,id DESC) n
 FROM public.shifts WHERE clock_out IS NULL
)
UPDATE public.shifts s SET clock_out=d.clock_in,notes=concat_ws(E'\n',s.notes,'Closed duplicate open shift during migration 011')
FROM duplicates d WHERE s.id=d.id AND d.n>1;
CREATE UNIQUE INDEX shifts_one_open_per_staff ON public.shifts(staff_id) WHERE clock_out IS NULL;
CREATE INDEX orders_staff_created_status ON public.orders(staff_id,created_at DESC,status);
CREATE INDEX orders_open_table ON public.orders(table_id) WHERE status IN ('draft','active','billed');
CREATE INDEX qr_pending_queue ON public.qr_pending_orders(status,created_at);
DROP INDEX IF EXISTS public.idx_tables_qr_token;
DROP INDEX IF EXISTS public.idx_tables_qr_token_lookup;

CREATE TABLE public.order_stock_movements (
 order_id uuid NOT NULL REFERENCES public.orders(id),
 ingredient_id uuid NOT NULL REFERENCES public.ingredients(id),
 quantity numeric(14,3) NOT NULL CHECK(quantity>0),
 reversed_at timestamptz,
 PRIMARY KEY(order_id,ingredient_id)
);
ALTER TABLE public.order_stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY stock_movements_admin_read ON public.order_stock_movements FOR SELECT TO authenticated USING(public.is_admin());

CREATE TABLE public.api_rate_limits(key text PRIMARY KEY, hits integer NOT NULL, expires_at timestamptz NOT NULL);
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;
CREATE INDEX rate_limit_expiry ON public.api_rate_limits(expires_at);

CREATE FUNCTION public.consume_rate_limit(p_key text,p_limit integer,p_window_seconds integer) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_hits integer;
BEGIN
 IF length(p_key)>160 OR p_limit NOT BETWEEN 1 AND 1000 OR p_window_seconds NOT BETWEEN 1 AND 3600 THEN
   RAISE EXCEPTION 'Invalid rate limit' USING ERRCODE='22023';
 END IF;
 DELETE FROM public.api_rate_limits WHERE expires_at<now()-interval '1 hour';
 INSERT INTO public.api_rate_limits AS r(key,hits,expires_at) VALUES(p_key,1,now()+make_interval(secs=>p_window_seconds))
 ON CONFLICT(key) DO UPDATE SET
   hits=CASE WHEN r.expires_at<=now() THEN 1 ELSE LEAST(r.hits+1,p_limit+1) END,
   expires_at=CASE WHEN r.expires_at<=now() THEN EXCLUDED.expires_at ELSE r.expires_at END
 RETURNING hits INTO v_hits;
 RETURN v_hits<=p_limit;
END $$;

CREATE FUNCTION public.record_staff_login(p_user_id uuid,p_success boolean,p_expected_hash text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u public.users;
BEGIN
 SELECT * INTO u FROM public.users WHERE id=p_user_id FOR UPDATE;
 IF NOT FOUND OR u.auth_user_id IS NOT NULL OR u.password_hash IS DISTINCT FROM p_expected_hash
 OR u.status NOT IN ('active','locked') OR (u.status='locked' AND (u.locked_until IS NULL OR u.locked_until>now())) THEN RETURN NULL; END IF;
 IF NOT p_success THEN
   UPDATE public.users SET failed_login_attempts=CASE WHEN u.status='locked' THEN 1 ELSE failed_login_attempts+1 END,
    status=CASE WHEN u.status='active' AND failed_login_attempts>=4 THEN 'locked' ELSE 'active' END,
    locked_until=CASE WHEN u.status='active' AND failed_login_attempts>=4 THEN now()+interval '15 minutes' ELSE NULL END
   WHERE id=u.id;
   RETURN NULL;
 END IF;
 UPDATE public.users SET failed_login_attempts=0,status='active',locked_until=NULL WHERE id=u.id RETURNING session_version INTO u.session_version;
 RETURN u.session_version;
END $$;

-- Returns whether this is a Supabase-backed administrator; JWT staff remain owner-scoped.
CREATE FUNCTION public.assert_actor(p_actor uuid,p_resource text,p_action text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u public.users; r public.roles;
BEGIN
 SELECT * INTO u FROM public.users WHERE id=p_actor AND status='active' FOR SHARE;
 SELECT * INTO r FROM public.roles WHERE id=u.role_id;
 IF u.id IS NULL OR r.id IS NULL OR (r.name<>'Admin' AND COALESCE(r.permissions#>>ARRAY[p_resource,p_action],'false')<>'true') THEN
   RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501';
 END IF;
 RETURN u.auth_user_id IS NOT NULL AND r.name='Admin';
END $$;

CREATE FUNCTION public.price_order_items(p_items jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE i jsonb; m jsonb; p public.products; md public.modifiers; v_price numeric; v_tax numeric;
 v_qty integer; v_label text; v_variants jsonb; v_mods jsonb; v_result jsonb:='[]'; v_seen integer[];
BEGIN
 IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 100 THEN
   RAISE EXCEPTION 'An order must contain 1-100 items' USING ERRCODE='22023';
 END IF;
 FOR i IN SELECT value FROM jsonb_array_elements(p_items) LOOP
   IF jsonb_typeof(i->'quantity') IS DISTINCT FROM 'number' OR (i->>'quantity')::numeric<>trunc((i->>'quantity')::numeric)
      OR (i->>'quantity')::numeric NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid quantity' USING ERRCODE='22023'; END IF;
   v_qty:=(i->>'quantity')::integer;
   SELECT * INTO p FROM public.products WHERE id=(i->>'product_id')::uuid FOR SHARE;
   IF NOT FOUND OR NOT p.is_available OR p.is_86d THEN RAISE EXCEPTION 'Product is unavailable' USING ERRCODE='22023'; END IF;
   v_label:=NULLIF(i->>'variant_label',''); v_price:=p.base_price; v_tax:=p.tax_rate;
   IF jsonb_array_length(COALESCE(p.price_variants,'[]'))>0 AND v_label IS NULL THEN
     RAISE EXCEPTION 'Select a product variant' USING ERRCODE='22023';
   END IF;
   IF v_label IS NOT NULL THEN
     SELECT jsonb_agg(value) INTO v_variants FROM jsonb_array_elements(COALESCE(p.price_variants,'[]')) WHERE value->>'label'=v_label;
     IF v_variants IS NULL OR jsonb_array_length(v_variants)<>1 THEN RAISE EXCEPTION 'Invalid or ambiguous variant' USING ERRCODE='22023'; END IF;
     v_price:=(v_variants->0->>'price')::numeric;
   END IF;
   v_mods:='[]'; v_seen:='{}';
   IF jsonb_typeof(COALESCE(i->'selected_modifiers','[]')) IS DISTINCT FROM 'array' OR jsonb_array_length(COALESCE(i->'selected_modifiers','[]'))>20 THEN
     RAISE EXCEPTION 'Invalid modifiers' USING ERRCODE='22023'; END IF;
   FOR m IN SELECT value FROM jsonb_array_elements(COALESCE(i->'selected_modifiers','[]')) LOOP
     SELECT * INTO md FROM public.modifiers WHERE id=(m->>'id')::integer AND product_id=p.id AND is_active FOR SHARE;
     IF NOT FOUND OR md.id=ANY(v_seen) THEN RAISE EXCEPTION 'Invalid or duplicate modifier' USING ERRCODE='22023'; END IF;
     v_seen:=array_append(v_seen,md.id); v_price:=v_price+md.price;
     v_mods:=v_mods||jsonb_build_array(jsonb_build_object('id',md.id,'name',md.name,'price',md.price));
   END LOOP;
   IF v_price<0 OR v_price>9999999 OR v_tax NOT BETWEEN 0 AND 100 OR length(COALESCE(i->>'notes',''))>200 THEN
     RAISE EXCEPTION 'Invalid product configuration or notes' USING ERRCODE='22023'; END IF;
   v_price:=round(v_price,2);
   -- Submitted prices are stale-menu assertions; authoritative values always come from the catalog.
   IF (i ? 'unit_price' AND round((i->>'unit_price')::numeric,2) IS DISTINCT FROM v_price)
      OR (i ? 'tax_rate' AND (i->>'tax_rate')::numeric IS DISTINCT FROM v_tax) THEN
     RAISE EXCEPTION 'Menu price changed; refresh the menu' USING ERRCODE='22023'; END IF;
   v_result:=v_result||jsonb_build_array(jsonb_build_object('product_id',p.id,'product_name',p.name,'variant_label',v_label,
     'quantity',v_qty,'unit_price',v_price,'tax_rate',v_tax,'subtotal',round(v_price*v_qty,2),
     'tax_amount',round(v_price*v_qty*v_tax/100,2),'notes',i->>'notes','selected_modifiers',v_mods));
 END LOOP;
 RETURN v_result;
END $$;

CREATE FUNCTION public.refresh_table_occupancy(p_table integer) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF p_table IS NULL THEN RETURN; END IF;
 PERFORM 1 FROM public.tables WHERE id=p_table FOR UPDATE;
 UPDATE public.tables SET status=CASE WHEN EXISTS(SELECT 1 FROM public.orders WHERE table_id=p_table AND status IN ('draft','active','billed')) THEN 'occupied' ELSE 'free' END
 WHERE id=p_table;
END $$;

CREATE FUNCTION public.save_order(p_actor uuid,p_payload jsonb,p_order_id uuid DEFAULT NULL,p_source text DEFAULT 'staff') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_admin boolean; o public.orders; v_items jsonb; v_sc jsonb; v_sub numeric; v_tax numeric; v_charge numeric;
 v_table integer; v_old_table integer; v_type text;
BEGIN
 v_admin:=public.assert_actor(p_actor,'orders','write');
 IF p_source NOT IN ('staff','qr') THEN RAISE EXCEPTION 'Invalid source' USING ERRCODE='22023'; END IF;
 IF p_order_id IS NOT NULL THEN
   SELECT * INTO o FROM public.orders WHERE id=p_order_id FOR UPDATE;
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
   INSERT INTO public.orders(staff_id,table_id,order_type,status,source,confirmed_by,customer_name,customer_phone,customer_address,notes,subtotal,tax_amount,service_charge,total)
   VALUES(p_actor,v_table,v_type,'active',p_source,CASE WHEN p_source='qr' THEN p_actor END,p_payload->>'customer_name',p_payload->>'customer_phone',p_payload->>'customer_address',p_payload->>'notes',v_sub,v_tax,v_charge,v_sub+v_tax+v_charge) RETURNING * INTO o;
 ELSE
   UPDATE public.orders SET table_id=v_table,order_type=v_type,customer_name=p_payload->>'customer_name',customer_phone=p_payload->>'customer_phone',
    customer_address=p_payload->>'customer_address',notes=p_payload->>'notes',subtotal=v_sub,tax_amount=v_tax,service_charge=v_charge,discount_amount=0,total=v_sub+v_tax+v_charge
   WHERE id=p_order_id RETURNING * INTO o;
   DELETE FROM public.order_items WHERE order_id=o.id;
 END IF;
 INSERT INTO public.order_items(order_id,product_id,variant_label,quantity,unit_price,tax_rate,tax_amount,subtotal,notes,selected_modifiers)
 SELECT o.id,(x->>'product_id')::uuid,x->>'variant_label',(x->>'quantity')::integer,(x->>'unit_price')::numeric,
  (x->>'tax_rate')::numeric,(x->>'tax_amount')::numeric,(x->>'subtotal')::numeric,x->>'notes',x->'selected_modifiers' FROM jsonb_array_elements(v_items) x;
 IF v_old_table IS DISTINCT FROM v_table THEN PERFORM public.refresh_table_occupancy(v_old_table); END IF;
 IF v_table IS NOT NULL THEN UPDATE public.tables SET status='occupied' WHERE id=v_table; END IF;
 INSERT INTO public.activity_logs(user_id,action,entity_type,entity_id,details)
 VALUES(p_actor,CASE WHEN p_order_id IS NULL THEN 'CREATE_ORDER' ELSE 'MODIFY_ORDER' END,'order',o.id::text,jsonb_build_object('total',o.total));
 RETURN to_jsonb(o);
END $$;

CREATE FUNCTION public.submit_qr_order(p_token uuid,p_name text,p_items jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t public.tables; v_items jsonb; q public.qr_pending_orders;
BEGIN
 SELECT * INTO t FROM public.tables WHERE qr_token=p_token FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invalid QR code' USING ERRCODE='P0002'; END IF;
 IF t.status IN ('reserved','cleaning') THEN RAISE EXCEPTION 'Table is unavailable' USING ERRCODE='22023'; END IF;
 IF length(trim(p_name)) NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Customer name required' USING ERRCODE='22023'; END IF;
 -- Table-based backstop cannot be bypassed by forged forwarding headers.
 IF NOT public.consume_rate_limit('table-order:'||t.id,30,600) THEN RAISE EXCEPTION 'Too many table orders; try again later' USING ERRCODE='22023'; END IF;
 v_items:=public.price_order_items(p_items);
 INSERT INTO public.qr_pending_orders(table_id,table_token,customer_name,items) VALUES(t.id,p_token,trim(p_name),v_items) RETURNING * INTO q;
 RETURN jsonb_build_object('id',q.id,'status',q.status,'created_at',q.created_at);
END $$;

CREATE FUNCTION public.process_qr_order(p_actor uuid,p_pending uuid,p_confirm boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE q public.qr_pending_orders; result jsonb;
BEGIN
 PERFORM public.assert_actor(p_actor,'orders','write');
 SELECT * INTO q FROM public.qr_pending_orders WHERE id=p_pending FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pending order not found' USING ERRCODE='P0002'; END IF;
 IF q.status<>'pending' THEN RAISE EXCEPTION 'Order already processed' USING ERRCODE='40001'; END IF;
 IF p_confirm THEN
   PERFORM 1 FROM public.tables WHERE id=q.table_id AND qr_token=q.table_token FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Table QR code changed; reject this pending order' USING ERRCODE='22023'; END IF;
   result:=public.save_order(p_actor,jsonb_build_object('table_id',q.table_id,'order_type','dine_in','customer_name',q.customer_name,'items',q.items),NULL,'qr');
   UPDATE public.qr_pending_orders SET status='confirmed',confirmed_order_id=(result->>'id')::uuid WHERE id=q.id;
 ELSE
   UPDATE public.qr_pending_orders SET status='rejected' WHERE id=q.id;
   result:=jsonb_build_object('success',true);
 END IF;
 INSERT INTO public.activity_logs(user_id,action,entity_type,entity_id,details) VALUES(p_actor,
  CASE WHEN p_confirm THEN 'CONFIRM_QR_ORDER' ELSE 'REJECT_QR_ORDER' END,'qr_pending_order',q.id::text,jsonb_build_object('order_id',result->>'id'));
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.deduct_stock_for_order(p_order_id uuid,p_performed_by uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v record; available numeric;
BEGIN
 PERFORM 1 FROM public.orders WHERE id=p_order_id AND status='paid' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order must be paid before stock deduction' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.order_stock_movements WHERE order_id=p_order_id) THEN RETURN; END IF;
 FOR v IN SELECT pi.ingredient_id,sum(oi.quantity*pi.quantity_used) quantity FROM public.order_items oi
  JOIN public.product_ingredients pi ON pi.product_id=oi.product_id WHERE oi.order_id=p_order_id GROUP BY pi.ingredient_id ORDER BY pi.ingredient_id LOOP
   SELECT quantity_available INTO available FROM public.ingredients WHERE id=v.ingredient_id FOR UPDATE;
   IF available<v.quantity THEN RAISE EXCEPTION 'Insufficient ingredient stock' USING ERRCODE='22023'; END IF;
   UPDATE public.ingredients SET quantity_available=quantity_available-v.quantity WHERE id=v.ingredient_id;
   INSERT INTO public.order_stock_movements(order_id,ingredient_id,quantity) VALUES(p_order_id,v.ingredient_id,v.quantity);
   INSERT INTO public.stock_transactions(ingredient_id,type,quantity,reference_id,performed_by,notes) VALUES(v.ingredient_id,'deduction',v.quantity,p_order_id,p_performed_by,'Order payment');
   INSERT INTO public.notifications(target_role,type,message,entity_id)
   SELECT 'admin','low_stock',format('Low stock: %s has %s %s remaining',name,quantity_available,unit),id::text
   FROM public.ingredients WHERE id=v.ingredient_id AND quantity_available<=reorder_threshold;
 END LOOP;
END $$;

CREATE FUNCTION public.settle_order(p_actor uuid,p_order uuid,p_payments jsonb,p_code text DEFAULT NULL,p_manual_discount numeric DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_admin boolean; o public.orders; d public.discounts; v_discount numeric:=0; v_due numeric; v_paid numeric:=0;
 p jsonb; amount numeric; tender numeric; methods jsonb;
BEGIN
 v_admin:=public.assert_actor(p_actor,'orders','write');
 SELECT * INTO o FROM public.orders WHERE id=p_order FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='P0002'; END IF;
 IF NOT v_admin AND o.staff_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501'; END IF;
 IF o.status NOT IN ('draft','active','billed') THEN RAISE EXCEPTION 'Order is already closed' USING ERRCODE='40001'; END IF;
 IF o.table_id IS NOT NULL THEN PERFORM 1 FROM public.tables WHERE id=o.table_id FOR UPDATE; END IF;
 IF NULLIF(trim(p_code),'') IS NOT NULL THEN
   SELECT * INTO d FROM public.discounts WHERE code=upper(trim(p_code)) FOR UPDATE;
   IF NOT FOUND OR NOT d.is_active OR (d.expires_at IS NOT NULL AND d.expires_at<=now()) OR (d.max_uses IS NOT NULL AND d.times_used>=d.max_uses) OR o.subtotal<d.min_order_amount THEN
     RAISE EXCEPTION 'Discount is invalid, expired, exhausted or below its minimum' USING ERRCODE='22023'; END IF;
   IF d.type='percentage' AND d.value>100 THEN RAISE EXCEPTION 'Invalid percentage discount' USING ERRCODE='22023'; END IF;
   v_discount:=round(CASE WHEN d.type='percentage' THEN o.subtotal*d.value/100 ELSE d.value END,2);
 ELSIF p_manual_discount<>0 THEN
   -- No UI offers authorized manual discounts; a supplied amount alone grants no authority.
   RAISE EXCEPTION 'A valid discount code is required' USING ERRCODE='22023';
 END IF;
 v_discount:=LEAST(v_discount,o.subtotal+o.tax_amount+o.service_charge);
 v_due:=round(o.subtotal+o.tax_amount+o.service_charge-v_discount,2);
 IF jsonb_typeof(p_payments) IS DISTINCT FROM 'array' OR jsonb_array_length(p_payments)>10 OR (v_due>0 AND jsonb_array_length(p_payments)=0) THEN
   RAISE EXCEPTION 'Invalid payment allocations' USING ERRCODE='22023'; END IF;
 SELECT value INTO methods FROM public.system_settings WHERE key='payment_methods';
 FOR p IN SELECT value FROM jsonb_array_elements(p_payments) LOOP
   IF p->>'method' NOT IN ('cash','card','upi','wallet','bank_transfer') OR COALESCE(methods->>(p->>'method'),'false')<>'true' THEN RAISE EXCEPTION 'Payment method is disabled' USING ERRCODE='22023'; END IF;
   IF jsonb_typeof(p->'amount') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid payment amount' USING ERRCODE='22023'; END IF;
   amount:=(p->>'amount')::numeric; tender:=(p->>'cash_tendered')::numeric;
   IF amount<0 OR amount<>round(amount,2) OR (v_due>0 AND amount=0) OR amount>99999999 THEN RAISE EXCEPTION 'Invalid payment amount' USING ERRCODE='22023'; END IF;
   IF p->>'method'='cash' AND (tender IS NULL OR tender<amount OR tender<>round(tender,2)) THEN RAISE EXCEPTION 'Insufficient cash tendered' USING ERRCODE='22023'; END IF;
   IF length(COALESCE(p->>'transaction_ref',''))>100 THEN RAISE EXCEPTION 'Reference too long' USING ERRCODE='22023'; END IF;
   v_paid:=v_paid+amount;
 END LOOP;
 IF v_paid<>v_due THEN RAISE EXCEPTION 'Payment amounts must equal the bill total' USING ERRCODE='22023'; END IF;
 UPDATE public.orders SET status='paid',discount_amount=v_discount,total=v_due WHERE id=o.id;
 INSERT INTO public.payments(order_id,method,amount,cash_tendered,change_given,transaction_ref)
 SELECT o.id,x->>'method',(x->>'amount')::numeric,
 CASE WHEN x->>'method'='cash' THEN (x->>'cash_tendered')::numeric END,
 CASE WHEN x->>'method'='cash' THEN (x->>'cash_tendered')::numeric-(x->>'amount')::numeric END,x->>'transaction_ref'
 FROM jsonb_array_elements(p_payments) x;
 IF d.id IS NOT NULL THEN UPDATE public.discounts SET times_used=times_used+1 WHERE id=d.id; END IF;
 PERFORM public.deduct_stock_for_order(o.id,p_actor);
 PERFORM public.refresh_table_occupancy(o.table_id);
 INSERT INTO public.activity_logs(user_id,action,entity_type,entity_id,details) VALUES(p_actor,'PROCESS_PAYMENT','order',o.id::text,jsonb_build_object('total',v_due,'discount',v_discount));
 RETURN jsonb_build_object('success',true,'total',v_due);
END $$;

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
 IF o.status='paid' AND EXISTS(SELECT 1 FROM public.stock_transactions WHERE reference_id=o.id AND type='deduction')
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

-- Remove every alternate browser mutation path around the transactions above.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
GRANT ALL ON public.order_stock_movements,public.api_rate_limits TO service_role;
GRANT SELECT ON public.order_stock_movements TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(),public.get_my_role(),public.get_my_user_id() TO authenticated;

COMMIT;
