-- ============================================================
-- RMS — Migration 010: Phone Validation Constraints
-- ============================================================

-- 1. Clean up seeded placeholder if exists
UPDATE system_settings 
  SET value = '""'::jsonb 
  WHERE key = 'restaurant_phone' AND value = '"+"';

-- 2. Add regex constraints on users table phone field
ALTER TABLE users 
  ADD CONSTRAINT check_phone_format 
  CHECK (phone IS NULL OR phone = '' OR phone ~ '^\+?[0-9]{10,15}$');

-- 3. Add regex constraints on orders table customer_phone field
ALTER TABLE orders 
  ADD CONSTRAINT check_customer_phone_format 
  CHECK (customer_phone IS NULL OR customer_phone = '' OR customer_phone ~ '^\+?[0-9]{10,15}$');

-- 4. Add regex check constraints to validate restaurant phone setting values (nested in JSONB value field)
ALTER TABLE system_settings
  ADD CONSTRAINT check_restaurant_phone_format
  CHECK (
    key != 'restaurant_phone' OR 
    value IS NULL OR
    value = '""'::jsonb OR
    (jsonb_typeof(value) = 'string' AND value #>> '{}' ~ '^\+?[0-9]{10,15}$')
  );
