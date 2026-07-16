-- ============================================================
-- RMS — Migration 002: Row Level Security Policies
-- ============================================================

ALTER TABLE roles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories         ENABLE ROW LEVEL SECURITY;
ALTER TABLE products           ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables             ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders             ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_splits     ENABLE ROW LEVEL SECURITY;
ALTER TABLE discounts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients        ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transactions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings    ENABLE ROW LEVEL SECURITY;

-- ─── HELPER: get current user's role name ───────────────────
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS TEXT AS $$
  SELECT r.name
  FROM   users u
  JOIN   roles r ON r.id = u.role_id
  WHERE  u.auth_user_id = auth.uid()
     OR  u.id::text = current_setting('app.staff_user_id', true)
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT get_my_role() IN ('Admin','Manager');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_my_user_id()
RETURNS UUID AS $$
  SELECT COALESCE(
    (SELECT id FROM users WHERE auth_user_id = auth.uid() LIMIT 1),
    (SELECT current_setting('app.staff_user_id', true)::uuid)
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─── ROLES ──────────────────────────────────────────────────
CREATE POLICY roles_select_all   ON roles FOR SELECT USING (true);
CREATE POLICY roles_admin_write  ON roles FOR ALL    USING (is_admin());

-- ─── USERS ──────────────────────────────────────────────────
-- Admin: full CRUD
-- Staff: can only read their own row
CREATE POLICY users_admin_all    ON users FOR ALL    USING (is_admin());
CREATE POLICY users_self_select  ON users FOR SELECT
  USING (id = get_my_user_id());

-- ─── CATEGORIES ─────────────────────────────────────────────
CREATE POLICY categories_select_all  ON categories FOR SELECT USING (true);
CREATE POLICY categories_admin_write ON categories FOR ALL    USING (is_admin());

-- ─── PRODUCTS ───────────────────────────────────────────────
CREATE POLICY products_select_all  ON products FOR SELECT USING (true);
CREATE POLICY products_admin_write ON products FOR ALL    USING (is_admin());

-- ─── TABLES ─────────────────────────────────────────────────
CREATE POLICY tables_select_all  ON tables FOR SELECT USING (true);
CREATE POLICY tables_admin_write ON tables FOR ALL    USING (is_admin());

-- ─── ORDERS ─────────────────────────────────────────────────
-- Admin: see all orders
-- Staff: see only their own orders
CREATE POLICY orders_admin_all   ON orders FOR ALL    USING (is_admin());
CREATE POLICY orders_staff_own   ON orders FOR SELECT
  USING (staff_id = get_my_user_id());
CREATE POLICY orders_staff_insert ON orders FOR INSERT
  WITH CHECK (staff_id = get_my_user_id());
CREATE POLICY orders_staff_update ON orders FOR UPDATE
  USING (staff_id = get_my_user_id())
  WITH CHECK (staff_id = get_my_user_id());

-- ─── ORDER ITEMS ────────────────────────────────────────────
CREATE POLICY order_items_admin_all   ON order_items FOR ALL USING (is_admin());
CREATE POLICY order_items_staff_own   ON order_items FOR SELECT
  USING (order_id IN (SELECT id FROM orders WHERE staff_id = get_my_user_id()));
CREATE POLICY order_items_staff_insert ON order_items FOR INSERT
  WITH CHECK (order_id IN (SELECT id FROM orders WHERE staff_id = get_my_user_id()));
CREATE POLICY order_items_staff_update ON order_items FOR UPDATE
  USING (order_id IN (SELECT id FROM orders WHERE staff_id = get_my_user_id()));
CREATE POLICY order_items_staff_delete ON order_items FOR DELETE
  USING (order_id IN (SELECT id FROM orders WHERE staff_id = get_my_user_id()));

-- ─── PAYMENTS ───────────────────────────────────────────────
CREATE POLICY payments_admin_all  ON payments FOR ALL USING (is_admin());
CREATE POLICY payments_staff_own  ON payments FOR SELECT
  USING (order_id IN (SELECT id FROM orders WHERE staff_id = get_my_user_id()));
CREATE POLICY payments_staff_insert ON payments FOR INSERT
  WITH CHECK (order_id IN (SELECT id FROM orders WHERE staff_id = get_my_user_id()));

-- ─── PAYMENT SPLITS ─────────────────────────────────────────
CREATE POLICY splits_admin_all  ON payment_splits FOR ALL USING (is_admin());
CREATE POLICY splits_staff_own  ON payment_splits FOR SELECT
  USING (order_id IN (SELECT id FROM orders WHERE staff_id = get_my_user_id()));
CREATE POLICY splits_staff_write ON payment_splits FOR INSERT
  WITH CHECK (order_id IN (SELECT id FROM orders WHERE staff_id = get_my_user_id()));

-- ─── DISCOUNTS ──────────────────────────────────────────────
-- Admin: full CRUD  |  Staff: read active codes only
CREATE POLICY discounts_admin_all    ON discounts FOR ALL    USING (is_admin());
CREATE POLICY discounts_staff_select ON discounts FOR SELECT
  USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));

-- ─── INGREDIENTS ────────────────────────────────────────────
CREATE POLICY ingredients_select_all  ON ingredients FOR SELECT USING (true);
CREATE POLICY ingredients_admin_write ON ingredients FOR ALL    USING (is_admin());

-- ─── PRODUCT INGREDIENTS ────────────────────────────────────
CREATE POLICY product_ing_select_all  ON product_ingredients FOR SELECT USING (true);
CREATE POLICY product_ing_admin_write ON product_ingredients FOR ALL    USING (is_admin());

-- ─── STOCK TRANSACTIONS ─────────────────────────────────────
CREATE POLICY stock_tx_admin_all   ON stock_transactions FOR ALL    USING (is_admin());
CREATE POLICY stock_tx_staff_read  ON stock_transactions FOR SELECT USING (true);

-- ─── SHIFTS ─────────────────────────────────────────────────
-- Admin: all  |  Staff: own shifts only
CREATE POLICY shifts_admin_all   ON shifts FOR ALL USING (is_admin());
CREATE POLICY shifts_staff_own   ON shifts FOR SELECT
  USING (staff_id = get_my_user_id());
CREATE POLICY shifts_staff_insert ON shifts FOR INSERT
  WITH CHECK (staff_id = get_my_user_id());
CREATE POLICY shifts_staff_update ON shifts FOR UPDATE
  USING (staff_id = get_my_user_id());

-- ─── ACTIVITY LOGS ──────────────────────────────────────────
-- Admin: full read  |  Staff: no access
CREATE POLICY logs_admin_all  ON activity_logs FOR ALL USING (is_admin());

-- ─── NOTIFICATIONS ──────────────────────────────────────────
CREATE POLICY notif_admin_all  ON notifications FOR ALL USING (is_admin());

-- ─── SYSTEM SETTINGS ────────────────────────────────────────
-- Admin: read/write  |  Staff: read only
CREATE POLICY settings_admin_write ON system_settings FOR ALL    USING (is_admin());
CREATE POLICY settings_staff_read  ON system_settings FOR SELECT USING (true);
