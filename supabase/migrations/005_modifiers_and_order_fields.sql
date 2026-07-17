-- ============================================================
-- RMS — Migration 005: Modifiers and Order Fields
-- ============================================================

-- ─── CREATE MODIFIERS TABLE ──────────────────────────────────
CREATE TABLE IF NOT EXISTS modifiers (
  id          SERIAL PRIMARY KEY,
  product_id  UUID REFERENCES products(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  price       NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (price >= 0),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ─── SECURITY ROW LEVEL SECURITY (RLS) ───────────────────────
ALTER TABLE modifiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY modifiers_select_all  ON modifiers FOR SELECT USING (true);
CREATE POLICY modifiers_admin_write ON modifiers FOR ALL    USING (is_admin());


-- ─── ADD MODIFIERS COLUMN TO ORDER ITEMS ──────────────────────
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS selected_modifiers JSONB DEFAULT '[]'::jsonb;

-- ─── SEED SAMPLE MODIFIERS ───────────────────────────────────
-- Margherita Pizza Modifiers
INSERT INTO modifiers (product_id, name, price)
SELECT id, 'Extra Cheese', 1.50 FROM products WHERE name = 'Margherita Pizza'
ON CONFLICT DO NOTHING;

INSERT INTO modifiers (product_id, name, price)
SELECT id, 'Add Pepperoni', 2.00 FROM products WHERE name = 'Margherita Pizza'
ON CONFLICT DO NOTHING;

INSERT INTO modifiers (product_id, name, price)
SELECT id, 'Add Mushrooms', 1.00 FROM products WHERE name = 'Margherita Pizza'
ON CONFLICT DO NOTHING;

-- Beef Burger Modifiers
INSERT INTO modifiers (product_id, name, price)
SELECT id, 'Extra Cheese', 1.00 FROM products WHERE name = 'Beef Burger'
ON CONFLICT DO NOTHING;

INSERT INTO modifiers (product_id, name, price)
SELECT id, 'Add Bacon', 1.75 FROM products WHERE name = 'Beef Burger'
ON CONFLICT DO NOTHING;

INSERT INTO modifiers (product_id, name, price)
SELECT id, 'Double Patty', 3.50 FROM products WHERE name = 'Beef Burger'
ON CONFLICT DO NOTHING;

INSERT INTO modifiers (product_id, name, price)
SELECT id, 'Gluten-Free Bun', 1.50 FROM products WHERE name = 'Beef Burger'
ON CONFLICT DO NOTHING;
