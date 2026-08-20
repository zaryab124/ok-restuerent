-- OK RESTAURANT PLATFORM - COMPLETE PRODUCTION SUPABASE DATABASE SEED

-- 1. Insert Branches
INSERT INTO branches (id, name, slug, address, phone) VALUES
('b1000000-0000-0000-0000-000000000001', 'Dera Chungi', 'dera-chungi', 'Opposite Shell Pump, Jampur', '0334-4683344'),
('b2000000-0000-0000-0000-000000000002', 'Sherifalon Bypass Road', 'sherifalon-bypass', 'Sherifalon Bypass Road, Jampur', '0336-4683344'),
('b3000000-0000-0000-0000-000000000003', 'Kot Chuta / Appo Chuta', 'kot-chuta', 'Main Highway, Kot Chuta', '0333-2225757')
ON CONFLICT (slug) DO NOTHING;

-- 2. Insert Branch Capabilities
INSERT INTO branch_capabilities (branch_id, dine_in_enabled, takeaway_enabled, delivery_enabled) VALUES
('b1000000-0000-0000-0000-000000000001', TRUE, TRUE, TRUE),
('b2000000-0000-0000-0000-000000000002', TRUE, TRUE, TRUE),
('b3000000-0000-0000-0000-000000000003', TRUE, TRUE, TRUE)
ON CONFLICT (branch_id) DO UPDATE SET
dine_in_enabled = EXCLUDED.dine_in_enabled,
takeaway_enabled = EXCLUDED.takeaway_enabled,
delivery_enabled = EXCLUDED.delivery_enabled;

-- 3. Insert All Role Profiles
INSERT INTO profiles (id, email, full_name, phone, role) VALUES
-- 3 OWNERS
('u1000000-0000-0000-0000-000000000001', 'owner1@okrestaurant.com', 'Muhammad Ibrahim (Owner 1)', '0333-4683344', 'OWNER'),
('u1000000-0000-0000-0000-000000000002', 'owner2@okrestaurant.com', 'Sheikh Farooq (Owner 2)', '0333-5551122', 'OWNER'),
('u1000000-0000-0000-0000-000000000003', 'owner3@okrestaurant.com', 'Malik Usman (Owner 3)', '0333-9994455', 'OWNER'),

-- BRANCH ADMINS FOR EVERY BRANCH
('u2000000-0000-0000-0000-000000000002', 'admin.dera@okrestaurant.com', 'Tariq Admin (Dera Chungi)', '0334-4683344', 'BRANCH_ADMIN'),
('u2000000-0000-0000-0000-000000000003', 'admin.sherifalon@okrestaurant.com', 'Sajjad Admin (Sherifalon)', '0336-4683344', 'BRANCH_ADMIN'),
('u2000000-0000-0000-0000-000000000004', 'admin.kotchuta@okrestaurant.com', 'Rashid Admin (Kot Chuta)', '0333-2225757', 'BRANCH_ADMIN'),

-- KITCHEN STAFF FOR EVERY BRANCH
('u3000000-0000-0000-0000-000000000001', 'kitchen.dera@okrestaurant.com', 'Chef Ahmad (Dera Kitchen)', '0300-1112233', 'KITCHEN'),
('u3000000-0000-0000-0000-000000000002', 'kitchen.sherifalon@okrestaurant.com', 'Chef Bilal (Sherifalon Kitchen)', '0300-4445566', 'KITCHEN'),
('u3000000-0000-0000-0000-000000000003', 'kitchen.kotchuta@okrestaurant.com', 'Chef Tariq (Kot Chuta Kitchen)', '0300-7778899', 'KITCHEN'),

-- RIDERS FOR EVERY BRANCH
('u4000000-0000-0000-0000-000000000001', 'rider1.dera@okrestaurant.com', 'Ali Rider (Dera Delivery)', '0301-9998877', 'RIDER'),
('u4000000-0000-0000-0000-000000000002', 'rider2.dera@okrestaurant.com', 'Hamza Rider (Dera Delivery)', '0301-3332211', 'RIDER'),
('u4000000-0000-0000-0000-000000000003', 'rider.sherifalon@okrestaurant.com', 'Zubair Rider (Sherifalon Delivery)', '0301-6665544', 'RIDER'),
('u4000000-0000-0000-0000-000000000004', 'rider.kotchuta@okrestaurant.com', 'Imran Rider (Kot Chuta Delivery)', '0301-8887766', 'RIDER'),

-- DEMO CUSTOMER
('u5000000-0000-0000-0000-000000000001', 'customer.demo@gmail.com', 'Usman Customer', '0321-5554433', 'CUSTOMER')
ON CONFLICT (email) DO NOTHING;

-- 4. Assign Branch Users
INSERT INTO branch_users (user_id, branch_id, role) VALUES
('u2000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'BRANCH_ADMIN'),
('u2000000-0000-0000-0000-000000000003', 'b2000000-0000-0000-0000-000000000002', 'BRANCH_ADMIN'),
('u2000000-0000-0000-0000-000000000004', 'b3000000-0000-0000-0000-000000000003', 'BRANCH_ADMIN'),
('u3000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'KITCHEN'),
('u3000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000002', 'KITCHEN'),
('u3000000-0000-0000-0000-000000000003', 'b3000000-0000-0000-0000-000000000003', 'KITCHEN'),
('u4000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'RIDER'),
('u4000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'RIDER'),
('u4000000-0000-0000-0000-000000000003', 'b2000000-0000-0000-0000-000000000002', 'RIDER'),
('u4000000-0000-0000-0000-000000000004', 'b3000000-0000-0000-0000-000000000003', 'RIDER')
ON CONFLICT (user_id, branch_id) DO NOTHING;

-- 5. Insert Tables & QR Tokens
INSERT INTO tables (id, branch_id, table_number, qr_code_token) VALUES
('t1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'T-01', 'qr_dera_t01_sec789'),
('t1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'T-02', 'qr_dera_t02_sec790'),
('t1000000-0000-0000-0000-000000000012', 'b1000000-0000-0000-0000-000000000001', 'T-12', 'qr_dera_t12_sec812'),
('t2000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002', 'T-01', 'qr_sher_t01_sec501'),
('t3000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000003', 'T-01', 'qr_kotc_t01_sec301')
ON CONFLICT (branch_id, table_number) DO NOTHING;

-- 6. Insert All 20 Menu Categories
INSERT INTO menu_categories (id, name, slug, icon, sort_order) VALUES
('c1', 'Special Platters & Offers', 'special-platters', 'Flame', 1),
('c2', 'Fast Food Deals (1-21)', 'fast-food-deals', 'Sparkles', 2),
('c3', 'Fast Food', 'fast-food', 'Utensils', 3),
('c4', 'OK Special Pizza', 'ok-special-pizza', 'Pizza', 4),
('c5', 'OK Regular Pizza', 'ok-regular-pizza', 'Pizza', 5),
('c6', 'Chicken Karahi', 'chicken-karahi', 'CookingPot', 6),
('c7', 'Chicken Handi', 'chicken-handi', 'Soup', 7),
('c8', 'Mutton Karahi', 'mutton-karahi', 'CookingPot', 8),
('c9', 'Mutton Handi', 'mutton-handi', 'Soup', 9),
('c10', 'Bar B.Q', 'bar-bq', 'Flame', 10),
('c11', 'Soup', 'soup', 'Soup', 11),
('c12', 'Chinese Starter', 'chinese-starter', 'Drumstick', 12),
('c13', 'Chowmain', 'chowmain', 'Utensils', 13),
('c14', 'Rice', 'rice', 'Utensils', 14),
('c15', 'Chinese Gravy', 'chinese-gravy', 'CookingPot', 15),
('c16', 'Salad & Raita', 'salad-raita', 'Utensils', 16),
('c17', 'Tandoor', 'tandoor', 'Flame', 17),
('c18', 'Beverages', 'beverages', 'Coffee', 18),
('c19', 'Tea', 'tea', 'Coffee', 19),
('c20', 'Ice Cream', 'ice-cream', 'Coffee', 20)
ON CONFLICT (slug) DO NOTHING;
