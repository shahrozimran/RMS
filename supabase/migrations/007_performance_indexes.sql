-- ============================================================
-- RMS — Migration 007: Performance Optimization Indexes
-- ============================================================

-- Index on orders(staff_id) for faster KPI lookups on dashboard
CREATE INDEX IF NOT EXISTS idx_orders_staff_id_status ON orders(staff_id, status);

-- Index on order_items for faster analytics and category calculations
CREATE INDEX IF NOT EXISTS idx_order_items_product_created ON order_items(product_id, created_at DESC);

-- Index on products for faster available product filtering by category
CREATE INDEX IF NOT EXISTS idx_products_category_availability ON products(category_id, is_available) 
  WHERE is_available = true AND is_86d = false;

-- Index on tables for faster token lookup on QR scans
CREATE INDEX IF NOT EXISTS idx_tables_qr_token_lookup ON tables(qr_token);
