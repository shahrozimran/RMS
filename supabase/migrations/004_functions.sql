-- ============================================================
-- RMS — Migration 004: PostgreSQL Functions
-- ============================================================

-- ─── get_staff_sales_summary ────────────────────────────────
-- Returns order count, revenue, average order value for a staff member
CREATE OR REPLACE FUNCTION get_staff_sales_summary(
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── get_order_analytics ────────────────────────────────────
-- Returns daily revenue breakdown for Admin reports
CREATE OR REPLACE FUNCTION get_order_analytics(
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── get_top_items ───────────────────────────────────────────
-- Returns top N selling products by quantity and revenue
CREATE OR REPLACE FUNCTION get_top_items(
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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── void_order (atomic) ────────────────────────────────────
-- Voids an order, reverses stock, logs action
CREATE OR REPLACE FUNCTION void_order(
  p_order_id   UUID,
  p_reason     TEXT,
  p_approved_by UUID
)
RETURNS VOID AS $$
DECLARE
  v_current_status TEXT;
BEGIN
  SELECT status INTO v_current_status FROM orders WHERE id = p_order_id FOR UPDATE;

  IF v_current_status NOT IN ('active','billed','paid') THEN
    RAISE EXCEPTION 'Order % cannot be voided (current status: %)', p_order_id, v_current_status;
  END IF;

  -- Update order status
  UPDATE orders
  SET status          = 'void',
      void_reason     = p_reason,
      void_approved_by = p_approved_by,
      updated_at      = now()
  WHERE id = p_order_id;

  -- Reset table status to free (if dine_in)
  UPDATE tables t
  SET status = 'free'
  FROM orders o
  WHERE o.id = p_order_id
    AND o.order_type = 'dine_in'
    AND o.table_id = t.id;

  -- Reverse stock deductions for this order
  INSERT INTO stock_transactions (ingredient_id, type, quantity, reference_id, notes, performed_by)
  SELECT
    pi.ingredient_id,
    'adjustment',
    oi.quantity * pi.quantity_used,
    p_order_id,
    'Stock reversal for voided order',
    p_approved_by
  FROM order_items oi
  JOIN product_ingredients pi ON pi.product_id = oi.product_id
  WHERE oi.order_id = p_order_id;

  -- Restore ingredient quantities
  UPDATE ingredients i
  SET quantity_available = i.quantity_available +
      (SELECT SUM(oi.quantity * pi.quantity_used)
       FROM order_items oi
       JOIN product_ingredients pi ON pi.product_id = oi.product_id
       WHERE oi.order_id = p_order_id AND pi.ingredient_id = i.id)
  WHERE i.id IN (
    SELECT DISTINCT pi.ingredient_id
    FROM order_items oi
    JOIN product_ingredients pi ON pi.product_id = oi.product_id
    WHERE oi.order_id = p_order_id
  );

  -- Log the action
  INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    p_approved_by,
    'VOID_ORDER',
    'order',
    p_order_id::text,
    jsonb_build_object('reason', p_reason, 'previous_status', v_current_status)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── deduct_stock_for_order (atomic) ────────────────────────
-- Deducts ingredient stock when an order is paid
CREATE OR REPLACE FUNCTION deduct_stock_for_order(
  p_order_id    UUID,
  p_performed_by UUID
)
RETURNS VOID AS $$
DECLARE
  v_ingredient   RECORD;
  v_new_qty      NUMERIC;
BEGIN
  -- Loop through all order items and deduct ingredients
  FOR v_ingredient IN
    SELECT
      pi.ingredient_id,
      i.name           AS ingredient_name,
      SUM(oi.quantity * pi.quantity_used) AS total_used,
      i.quantity_available,
      i.reorder_threshold
    FROM order_items oi
    JOIN product_ingredients pi ON pi.product_id = oi.product_id
    JOIN ingredients i          ON i.id = pi.ingredient_id
    WHERE oi.order_id = p_order_id
    GROUP BY pi.ingredient_id, i.name, i.quantity_available, i.reorder_threshold
  LOOP
    v_new_qty := v_ingredient.quantity_available - v_ingredient.total_used;

    -- Update stock
    UPDATE ingredients
    SET quantity_available = GREATEST(v_new_qty, 0),
        updated_at         = now()
    WHERE id = v_ingredient.ingredient_id;

    -- Record stock transaction
    INSERT INTO stock_transactions (ingredient_id, type, quantity, reference_id, notes, performed_by)
    VALUES (
      v_ingredient.ingredient_id,
      'deduction',
      v_ingredient.total_used,
      p_order_id,
      'Auto-deducted on order payment',
      p_performed_by
    );

    -- Create low-stock notification if below threshold
    IF v_new_qty <= v_ingredient.reorder_threshold THEN
      INSERT INTO notifications (target_role, type, message, entity_id)
      VALUES (
        'admin',
        'low_stock',
        format('Low stock alert: %s has %.2f units remaining (threshold: %.2f)',
          v_ingredient.ingredient_name, GREATEST(v_new_qty, 0), v_ingredient.reorder_threshold),
        v_ingredient.ingredient_id::text
      );
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── generate_tables ────────────────────────────────────────
-- Generates N tables, soft-deleting extras that are not occupied
CREATE OR REPLACE FUNCTION generate_tables(p_count INT)
RETURNS TEXT AS $$
DECLARE
  v_current_count INT;
  v_i             INT;
BEGIN
  SELECT COUNT(*) INTO v_current_count FROM tables;

  IF p_count > v_current_count THEN
    -- Add missing tables
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

-- ─── payment_method_split ───────────────────────────────────
-- Returns payment method breakdown for analytics
CREATE OR REPLACE FUNCTION get_payment_method_split(
  p_from_date TIMESTAMPTZ DEFAULT now() - INTERVAL '30 days',
  p_to_date   TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  method  TEXT,
  count   BIGINT,
  total   NUMERIC
) AS $$
BEGIN
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
