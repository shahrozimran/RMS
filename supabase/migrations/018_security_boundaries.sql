BEGIN;

-- Browser clients read only the columns used by administrator order joins.
-- All writes to these tables and all QR queue access use authenticated app APIs.
REVOKE ALL ON public.users,public.roles,public.products,public.categories,public.modifiers,
  public.discounts,public.notifications,public.qr_pending_orders FROM PUBLIC,anon,authenticated;
GRANT SELECT (id,name) ON public.users,public.products TO authenticated;
DROP POLICY IF EXISTS products_select_all ON public.products;
-- A demoted Supabase identity no longer has a browser data path. Staff JWT
-- access to their own records is enforced by the application's API instead.
DROP POLICY IF EXISTS users_self_select ON public.users;
DROP POLICY IF EXISTS orders_staff_own ON public.orders;
DROP POLICY IF EXISTS order_items_staff_own ON public.order_items;
DROP POLICY IF EXISTS payments_staff_own ON public.payments;
DROP POLICY IF EXISTS splits_staff_own ON public.payment_splits;
DROP POLICY IF EXISTS shifts_staff_own ON public.shifts;

-- Legacy timed lockouts already revoked their old sessions. Keep the cooldown
-- while separating it from the account status used to validate future sessions.
UPDATE public.users SET status='active'
WHERE auth_user_id IS NULL AND status='locked' AND locked_until IS NOT NULL;

CREATE OR REPLACE FUNCTION public.bump_session_version() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
  IF NEW.password_hash IS DISTINCT FROM OLD.password_hash OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.role_id IS DISTINCT FROM OLD.role_id OR NEW.username IS DISTINCT FROM OLD.username THEN
    NEW.session_version:=OLD.session_version+1;
  END IF;
  IF NEW.password_hash IS DISTINCT FROM OLD.password_hash OR (OLD.status<>'active' AND NEW.status='active') THEN
    NEW.failed_login_attempts:=0;
    NEW.locked_until:=NULL;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.record_staff_login(p_user_id uuid,p_success boolean,p_expected_hash text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE u public.users; attempts integer;
BEGIN
  SELECT * INTO u FROM public.users WHERE id=p_user_id FOR UPDATE;
  IF NOT FOUND OR u.auth_user_id IS NOT NULL OR u.password_hash IS DISTINCT FROM p_expected_hash
    OR u.status<>'active' OR u.locked_until>now() THEN RETURN NULL; END IF;
  IF p_success IS NOT TRUE THEN
    attempts:=CASE WHEN u.locked_until IS NOT NULL THEN 1 ELSE LEAST(u.failed_login_attempts,4)+1 END;
    UPDATE public.users SET failed_login_attempts=attempts,
      locked_until=CASE WHEN attempts>=5 THEN now()+interval '15 minutes' ELSE NULL END
    WHERE id=u.id;
    RETURN NULL;
  END IF;
  UPDATE public.users SET failed_login_attempts=0,locked_until=NULL WHERE id=u.id;
  RETURN u.session_version;
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
 IF o.status='paid' OR EXISTS(SELECT 1 FROM public.payments WHERE order_id=o.id AND status='completed') THEN
   PERFORM public.assert_actor(p_approved_by,'orders','refund');
 END IF;
 IF length(trim(p_reason)) NOT BETWEEN 5 AND 300 THEN RAISE EXCEPTION 'Void reason must be 5-300 characters' USING ERRCODE='22023'; END IF;
 -- Old deduction records contain requested quantities, which may have been clamped.
 -- Do not invent a historical stock movement or silently refund without reversing it.
 IF o.inventory_confirmed_at IS NULL AND EXISTS(SELECT 1 FROM public.stock_transactions WHERE reference_id=o.id AND type='deduction')
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

COMMIT;
