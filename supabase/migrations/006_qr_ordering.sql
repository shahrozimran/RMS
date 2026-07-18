-- ============================================================
-- RMS — Migration 006: QR Code Self-Ordering System
-- ============================================================

-- ─── 1. Add qr_token to tables ──────────────────────────────
-- Each table gets a permanent, unique, unguessable URL token.
ALTER TABLE tables
  ADD COLUMN IF NOT EXISTS qr_token UUID UNIQUE DEFAULT gen_random_uuid();

-- Backfill any existing tables that may have NULL tokens
UPDATE tables SET qr_token = gen_random_uuid() WHERE qr_token IS NULL;

-- Make it NOT NULL after backfill
ALTER TABLE tables
  ALTER COLUMN qr_token SET NOT NULL;

-- Index for fast lookup by token (used on every QR scan)
CREATE INDEX IF NOT EXISTS idx_tables_qr_token ON tables(qr_token);

-- ─── 2. Add source + confirmed_by to orders ─────────────────
-- source: 'staff' = placed by staff POS | 'qr' = placed via customer QR scan
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'staff'
    CHECK (source IN ('staff', 'qr'));

-- confirmed_by: which staff member confirmed the QR order
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- Index for filtering QR orders
CREATE INDEX IF NOT EXISTS idx_orders_source ON orders(source);

-- ─── 3. Create qr_pending_orders table ──────────────────────
-- Staging table: customer submits cart → pending row created.
-- Staff confirms → real order created, pending row marked 'confirmed'.
CREATE TABLE IF NOT EXISTS qr_pending_orders (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id      INT  NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
  table_token   UUID NOT NULL,
  customer_name TEXT,
  items         JSONB NOT NULL,
  -- Array of: { product_id, variant_label, quantity, unit_price, tax_rate, notes, product_name }
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'confirmed', 'rejected')),
  confirmed_order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qr_pending_table_id ON qr_pending_orders(table_id);
CREATE INDEX IF NOT EXISTS idx_qr_pending_status   ON qr_pending_orders(status);
CREATE INDEX IF NOT EXISTS idx_qr_pending_token    ON qr_pending_orders(table_token);

-- Auto-update updated_at
CREATE TRIGGER trg_qr_pending_updated_at
  BEFORE UPDATE ON qr_pending_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── 4. RLS for qr_pending_orders ───────────────────────────
ALTER TABLE qr_pending_orders ENABLE ROW LEVEL SECURITY;

-- Public can INSERT (customers submit orders via QR — no auth)
CREATE POLICY qr_pending_public_insert
  ON qr_pending_orders FOR INSERT
  WITH CHECK (true);

-- Public can SELECT their own pending order by ID (for status polling)
CREATE POLICY qr_pending_public_select
  ON qr_pending_orders FOR SELECT
  USING (true);

-- Only authenticated staff/admin can UPDATE (confirm/reject)
CREATE POLICY qr_pending_auth_update
  ON qr_pending_orders FOR UPDATE
  USING (
    is_admin()
    OR get_my_user_id() IS NOT NULL
  );

-- ─── 5. Update generate_tables to include qr_token ──────────
CREATE OR REPLACE FUNCTION generate_tables(p_count INT)
RETURNS TEXT AS $$
DECLARE
  v_current_count INT;
  v_i             INT;
BEGIN
  SELECT COUNT(*) INTO v_current_count FROM tables;

  IF p_count > v_current_count THEN
    -- Add missing tables (qr_token defaults to gen_random_uuid())
    FOR v_i IN (v_current_count + 1)..p_count LOOP
      INSERT INTO tables (table_number, section, capacity, status)
      VALUES ('T' || v_i, 'Main Hall', 4, 'free');
    END LOOP;
  ELSIF p_count < v_current_count THEN
    -- Remove empty tables from the end (highest IDs first)
    DELETE FROM tables
    WHERE id IN (
      SELECT id FROM tables
      WHERE status = 'free'
      ORDER BY id DESC
      LIMIT (v_current_count - p_count)
    );
  END IF;

  RETURN format('Tables adjusted to %s total', p_count);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
