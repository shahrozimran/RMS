-- ============================================================
-- RMS — Migration 003: Seed Data
-- ============================================================

-- ─── DEFAULT ROLES ──────────────────────────────────────────
INSERT INTO roles (name, permissions) VALUES
(
  'Admin',
  '{
    "menu":     {"read":true,"write":true,"delete":true},
    "staff":    {"read":true,"write":true,"delete":true},
    "orders":   {"read":true,"write":true,"void":true,"refund":true},
    "reports":  {"read":true,"export":true},
    "settings": {"read":true,"write":true},
    "inventory":{"read":true,"write":true},
    "discounts":{"read":true,"write":true,"delete":true}
  }'
),
(
  'Manager',
  '{
    "menu":     {"read":true,"write":true,"delete":false},
    "staff":    {"read":true,"write":false,"delete":false},
    "orders":   {"read":true,"write":true,"void":true,"refund":false},
    "reports":  {"read":true,"export":true},
    "settings": {"read":true,"write":false},
    "inventory":{"read":true,"write":true},
    "discounts":{"read":true,"write":false,"delete":false}
  }'
),
(
  'Waiter',
  '{
    "menu":     {"read":true,"write":false,"delete":false},
    "staff":    {"read":false,"write":false,"delete":false},
    "orders":   {"read":false,"write":true,"void":false,"refund":false},
    "reports":  {"read":false,"export":false},
    "settings": {"read":false,"write":false},
    "inventory":{"read":false,"write":false},
    "discounts":{"read":true,"write":false,"delete":false}
  }'
),
(
  'Cashier',
  '{
    "menu":     {"read":true,"write":false,"delete":false},
    "staff":    {"read":false,"write":false,"delete":false},
    "orders":   {"read":false,"write":true,"void":false,"refund":false},
    "reports":  {"read":false,"export":false},
    "settings": {"read":false,"write":false},
    "inventory":{"read":false,"write":false},
    "discounts":{"read":true,"write":false,"delete":false}
  }'
);

-- ─── SYSTEM SETTINGS DEFAULTS ───────────────────────────────
INSERT INTO system_settings (key, value) VALUES
('restaurant_name',   '"My Restaurant"'),
('restaurant_address','"123 Main Street, City"'),
('restaurant_phone',  '"+"'),
('restaurant_logo',   'null'),
('currency',          '{"code":"USD","symbol":"$","locale":"en-US"}'),
('service_charge',    '{"type":"percentage","value":0}'),
('payment_methods',   '{"cash":true,"card":true,"upi":true,"wallet":false,"bank_transfer":false}'),
('table_count',       '{"count":10}');

-- ─── SAMPLE CATEGORIES ──────────────────────────────────────
INSERT INTO categories (name, description, sort_order) VALUES
('Starters',   'Appetizers and small bites',         1),
('Mains',      'Main course dishes',                  2),
('Desserts',   'Sweet treats and desserts',           3),
('Beverages',  'Hot and cold drinks',                 4),
('Specials',   'Chef specials and seasonal dishes',   5);

-- ─── SAMPLE PRODUCTS ────────────────────────────────────────
INSERT INTO products (name, description, category_id, base_price, tax_rate, is_available) VALUES
('Spring Rolls',      'Crispy vegetable spring rolls with dipping sauce',      1,  5.99,  5.0, true),
('Chicken Wings',     'Spicy buffalo chicken wings (6 pcs)',                   1,  8.99,  5.0, true),
('Grilled Salmon',    'Atlantic salmon with lemon butter and seasonal veggies', 2, 18.99, 10.0, true),
('Beef Burger',       'Angus beef patty with lettuce, tomato, cheese & fries', 2, 14.99, 10.0, true),
('Margherita Pizza',  'Classic tomato, mozzarella and fresh basil',            2, 13.99, 10.0, true),
('Pasta Arrabiata',   'Penne in spicy tomato sauce with garlic',               2, 11.99, 10.0, true),
('Chocolate Lava Cake','Warm chocolate cake with a gooey center & ice cream',  3,  6.99,  5.0, true),
('Tiramisu',          'Classic Italian espresso dessert',                      3,  5.99,  5.0, true),
('Fresh Lemonade',    'Homemade lemonade with fresh mint',                     4,  3.49,  0.0, true),
('Cappuccino',        'Double shot espresso with steamed milk foam',           4,  3.99,  0.0, true);

-- ─── SAMPLE TABLES ──────────────────────────────────────────
INSERT INTO tables (table_number, section, capacity, status) VALUES
('T1',  'Main Hall',  4, 'free'),
('T2',  'Main Hall',  4, 'free'),
('T3',  'Main Hall',  6, 'free'),
('T4',  'Main Hall',  6, 'free'),
('T5',  'Main Hall',  2, 'free'),
('T6',  'Terrace',    4, 'free'),
('T7',  'Terrace',    4, 'free'),
('T8',  'Terrace',    6, 'free'),
('T9',  'Private',    8, 'free'),
('T10', 'Bar',        2, 'free');

-- ─── SAMPLE INGREDIENTS ─────────────────────────────────────
INSERT INTO ingredients (name, unit, quantity_available, reorder_threshold, cost_per_unit) VALUES
('All-Purpose Flour', 'kg',   20.0, 5.0,  0.80),
('Mozzarella Cheese', 'kg',   10.0, 2.0,  8.50),
('Tomato Sauce',      'L',    15.0, 3.0,  2.00),
('Chicken Wings',     'kg',   12.0, 3.0,  6.00),
('Beef Patty',        'pcs',  50.0, 10.0, 2.50),
('Salmon Fillet',     'kg',    8.0, 2.0, 18.00),
('Espresso Coffee',   'kg',    5.0, 1.0, 25.00),
('Fresh Lemons',      'pcs', 100.0, 20.0,  0.20),
('Heavy Cream',       'L',    10.0, 2.0,  3.50),
('Dark Chocolate',    'kg',    5.0, 1.0, 12.00);

-- ─── SAMPLE USERS / STAFF ────────────────────────────────────
-- Cashier: cashier_one / password123
-- Waiter: waiter_one / password123
INSERT INTO users (name, username, password_hash, role_id, status) VALUES
('Cashier One', 'cashier_one', '$2b$12$V.ORC6QnwMQsv6mLMABPR.VO76jzx88UTCWGz/DRjwCXzqHfXZqUO', 4, 'active'),
('Waiter One',  'waiter_one',  '$2b$12$V.ORC6QnwMQsv6mLMABPR.VO76jzx88UTCWGz/DRjwCXzqHfXZqUO', 3, 'active');

