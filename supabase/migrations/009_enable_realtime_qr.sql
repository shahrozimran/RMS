-- ============================================================
-- RMS — Migration 009: Enable Postgres Realtime on qr_pending_orders
-- ============================================================

-- Add the pending orders table to the Supabase Realtime publication
-- to enable zero-delay WebSocket events on staff dashboards.
ALTER PUBLICATION supabase_realtime ADD TABLE qr_pending_orders;
