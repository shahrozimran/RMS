-- ============================================================
-- RMS — Migration 008: Row Level Security Hardening
-- ============================================================

-- ─── 1. Harden qr_pending_orders policies ────────────────────
-- Drop old permissive policies
DROP POLICY IF EXISTS qr_pending_public_insert ON qr_pending_orders;
DROP POLICY IF EXISTS qr_pending_public_select ON qr_pending_orders;
DROP POLICY IF EXISTS qr_pending_auth_update ON qr_pending_orders;

-- Make sure RLS is enabled
ALTER TABLE qr_pending_orders ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (so public customer browser can place the order payload)
CREATE POLICY qr_pending_anon_insert ON qr_pending_orders
  FOR INSERT WITH CHECK (true);

-- Restrict read, update, delete actions to authenticated staff and admin roles only.
-- Anonymous users can NEVER fetch rows directly from the browser SDK.
CREATE POLICY qr_pending_auth_all ON qr_pending_orders
  FOR ALL TO authenticated
  USING (
    is_admin()
    OR get_my_user_id() IS NOT NULL
  )
  WITH CHECK (
    is_admin()
    OR get_my_user_id() IS NOT NULL
  );
