-- ============================================================
-- RMS — Migration 001: Initial Schema
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── ROLES & PERMISSIONS ────────────────────────────────────
CREATE TABLE roles (
  id          SERIAL PRIMARY KEY,
  name        TEXT UNIQUE NOT NULL,
  permissions JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ─── USERS ──────────────────────────────────────────────────
CREATE TABLE users (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id           UUID REFERENCES auth.users ON DELETE SET NULL,
  name                   TEXT NOT NULL,
  username               TEXT UNIQUE NOT NULL,
  password_hash          TEXT,
  email                  TEXT,
  phone                  TEXT,
  role_id                INTEGER REFERENCES roles(id) ON DELETE SET NULL,
  status                 TEXT NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active','suspended','locked','deleted')),
  failed_login_attempts  INT NOT NULL DEFAULT 0,
  locked_until           TIMESTAMPTZ,
  created_by             UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ DEFAULT now()
);

-- ─── CATEGORIES ─────────────────────────────────────────────
CREATE TABLE categories (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ─── PRODUCTS / MENU ITEMS ──────────────────────────────────
CREATE TABLE products (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  description    TEXT,
  category_id    INT REFERENCES categories(id) ON DELETE SET NULL,
  base_price     NUMERIC(10,2) NOT NULL CHECK (base_price >= 0),
  price_variants JSONB,
  -- e.g. [{"label":"Half","price":5.99},{"label":"Full","price":10.99}]
  tax_rate       NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0),
  -- per-product tax percentage, e.g. 5.00 = 5%
  image_url      TEXT,
  is_available   BOOLEAN NOT NULL DEFAULT true,
  is_86d         BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

-- ─── TABLES ─────────────────────────────────────────────────
CREATE TABLE tables (
  id           SERIAL PRIMARY KEY,
  table_number TEXT NOT NULL,
  section      TEXT,
  capacity     INT,
  status       TEXT NOT NULL DEFAULT 'free'
                 CHECK (status IN ('free','occupied','reserved','cleaning')),
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ─── ORDERS ─────────────────────────────────────────────────
CREATE TABLE orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id          UUID REFERENCES users(id) ON DELETE SET NULL,
  table_id          INT REFERENCES tables(id) ON DELETE SET NULL,
  order_type        TEXT NOT NULL CHECK (order_type IN ('dine_in','takeaway','delivery')),
  status            TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','active','billed','paid','void','refunded')),
  subtotal          NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_amount        NUMERIC(10,2) NOT NULL DEFAULT 0,
  service_charge    NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_amount   NUMERIC(10,2) NOT NULL DEFAULT 0,
  total             NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes             TEXT,
  customer_name     TEXT,
  customer_phone    TEXT,
  customer_address  TEXT,
  void_reason       TEXT,
  void_approved_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- ─── ORDER ITEMS ────────────────────────────────────────────
CREATE TABLE order_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id    UUID REFERENCES products(id) ON DELETE SET NULL,
  variant_label TEXT,
  quantity      INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price    NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
  tax_rate      NUMERIC(5,2) NOT NULL DEFAULT 0,
  -- snapshot of product.tax_rate at time of order
  tax_amount    NUMERIC(10,2) NOT NULL DEFAULT 0,
  subtotal      NUMERIC(10,2) NOT NULL CHECK (subtotal >= 0),
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ─── PAYMENTS ───────────────────────────────────────────────
CREATE TABLE payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  method          TEXT NOT NULL CHECK (method IN ('cash','card','upi','wallet','bank_transfer')),
  amount          NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  cash_tendered   NUMERIC(10,2),
  change_given    NUMERIC(10,2),
  status          TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed','refunded','failed')),
  transaction_ref TEXT,
  paid_at         TIMESTAMPTZ DEFAULT now()
);

-- ─── PAYMENT SPLITS ─────────────────────────────────────────
CREATE TABLE payment_splits (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id       UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  split_index    INT NOT NULL,
  customer_label TEXT,
  item_ids       JSONB,
  amount         NUMERIC(10,2),
  is_paid        BOOLEAN NOT NULL DEFAULT false
);

-- ─── DISCOUNTS (Admin-created only) ─────────────────────────
CREATE TABLE discounts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code              TEXT UNIQUE NOT NULL,
  type              TEXT NOT NULL CHECK (type IN ('percentage','flat')),
  value             NUMERIC(10,2) NOT NULL CHECK (value > 0),
  min_order_amount  NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_uses          INT,
  times_used        INT NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  expires_at        TIMESTAMPTZ,
  created_by        UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- ─── INVENTORY ──────────────────────────────────────────────
CREATE TABLE ingredients (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  unit                TEXT NOT NULL,
  quantity_available  NUMERIC(10,3) NOT NULL DEFAULT 0,
  reorder_threshold   NUMERIC(10,3) NOT NULL DEFAULT 0,
  cost_per_unit       NUMERIC(10,2),
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE product_ingredients (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  ingredient_id  UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  quantity_used  NUMERIC(10,3) NOT NULL CHECK (quantity_used > 0),
  UNIQUE(product_id, ingredient_id)
);

CREATE TABLE stock_transactions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ingredient_id  UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  type           TEXT NOT NULL CHECK (type IN ('top_up','deduction','adjustment')),
  quantity       NUMERIC(10,3) NOT NULL,
  reference_id   UUID,
  notes          TEXT,
  performed_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- ─── SHIFTS ─────────────────────────────────────────────────
CREATE TABLE shifts (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clock_in  TIMESTAMPTZ NOT NULL DEFAULT now(),
  clock_out TIMESTAMPTZ,
  notes     TEXT
);

-- ─── ACTIVITY LOGS ──────────────────────────────────────────
CREATE TABLE activity_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  details     JSONB,
  ip_address  TEXT,
  timestamp   TIMESTAMPTZ DEFAULT now()
);

-- ─── NOTIFICATIONS ──────────────────────────────────────────
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_role TEXT NOT NULL DEFAULT 'admin',
  type        TEXT NOT NULL,
  message     TEXT NOT NULL,
  entity_id   TEXT,
  is_read     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- ─── SYSTEM SETTINGS ────────────────────────────────────────
CREATE TABLE system_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ─── INDEXES ────────────────────────────────────────────────
CREATE INDEX idx_orders_staff_id       ON orders(staff_id);
CREATE INDEX idx_orders_status         ON orders(status);
CREATE INDEX idx_orders_created_at     ON orders(created_at DESC);
CREATE INDEX idx_order_items_order_id  ON order_items(order_id);
CREATE INDEX idx_payments_order_id     ON payments(order_id);
CREATE INDEX idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX idx_activity_logs_ts      ON activity_logs(timestamp DESC);
CREATE INDEX idx_stock_tx_ingredient   ON stock_transactions(ingredient_id);
CREATE INDEX idx_shifts_staff_id       ON shifts(staff_id);

-- ─── UPDATED_AT TRIGGER ─────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_ingredients_updated_at
  BEFORE UPDATE ON ingredients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
