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
('10000000-0000-0000-0000-000000000001', 'owner1@okrestaurant.com', 'Muhammad Ibrahim (Owner 1)', '0333-4683344', 'OWNER'),
('10000000-0000-0000-0000-000000000002', 'owner2@okrestaurant.com', 'Sheikh Farooq (Owner 2)', '0333-5551122', 'OWNER'),
('10000000-0000-0000-0000-000000000003', 'owner3@okrestaurant.com', 'Malik Usman (Owner 3)', '0333-9994455', 'OWNER'),

-- BRANCH ADMINS FOR EVERY BRANCH
('20000000-0000-0000-0000-000000000002', 'admin.dera@okrestaurant.com', 'Tariq Admin (Dera Chungi)', '0334-4683344', 'BRANCH_ADMIN'),
('20000000-0000-0000-0000-000000000003', 'admin.sherifalon@okrestaurant.com', 'Sajjad Admin (Sherifalon)', '0336-4683344', 'BRANCH_ADMIN'),
('20000000-0000-0000-0000-000000000004', 'admin.kotchuta@okrestaurant.com', 'Rashid Admin (Kot Chuta)', '0333-2225757', 'BRANCH_ADMIN'),

-- KITCHEN STAFF FOR EVERY BRANCH
('30000000-0000-0000-0000-000000000001', 'kitchen.dera@okrestaurant.com', 'Chef Ahmad (Dera Kitchen)', '0300-1112233', 'KITCHEN'),
('30000000-0000-0000-0000-000000000002', 'kitchen.sherifalon@okrestaurant.com', 'Chef Bilal (Sherifalon Kitchen)', '0300-4445566', 'KITCHEN'),
('30000000-0000-0000-0000-000000000003', 'kitchen.kotchuta@okrestaurant.com', 'Chef Tariq (Kot Chuta Kitchen)', '0300-7778899', 'KITCHEN'),

-- RIDERS FOR EVERY BRANCH
('40000000-0000-0000-0000-000000000001', 'rider1.dera@okrestaurant.com', 'Ali Rider (Dera Delivery)', '0301-9998877', 'RIDER'),
('40000000-0000-0000-0000-000000000002', 'rider2.dera@okrestaurant.com', 'Hamza Rider (Dera Delivery)', '0301-3332211', 'RIDER'),
('40000000-0000-0000-0000-000000000003', 'rider.sherifalon@okrestaurant.com', 'Zubair Rider (Sherifalon Delivery)', '0301-6665544', 'RIDER'),
('40000000-0000-0000-0000-000000000004', 'rider.kotchuta@okrestaurant.com', 'Imran Rider (Kot Chuta Delivery)', '0301-8887766', 'RIDER'),

-- DEMO CUSTOMER
('50000000-0000-0000-0000-000000000001', 'customer.demo@gmail.com', 'Usman Customer', '0321-5554433', 'CUSTOMER')
ON CONFLICT (email) DO NOTHING;

-- 4. Assign Branch Users
INSERT INTO branch_users (user_id, branch_id, role) VALUES
('20000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'BRANCH_ADMIN'),
('20000000-0000-0000-0000-000000000003', 'b2000000-0000-0000-0000-000000000002', 'BRANCH_ADMIN'),
('20000000-0000-0000-0000-000000000004', 'b3000000-0000-0000-0000-000000000003', 'BRANCH_ADMIN'),
('30000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'KITCHEN'),
('30000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000002', 'KITCHEN'),
('30000000-0000-0000-0000-000000000003', 'b3000000-0000-0000-0000-000000000003', 'KITCHEN'),
('40000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'RIDER'),
('40000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'RIDER'),
('40000000-0000-0000-0000-000000000003', 'b2000000-0000-0000-0000-000000000002', 'RIDER'),
('40000000-0000-0000-0000-000000000004', 'b3000000-0000-0000-0000-000000000003', 'RIDER')
ON CONFLICT (user_id, branch_id) DO NOTHING;

-- 5. Insert Tables & QR Tokens
INSERT INTO tables (id, branch_id, table_number, qr_code_token) VALUES
('70000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'T-01', 'qr_dera_t01_sec789'),
('70000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'T-02', 'qr_dera_t02_sec790'),
('70000000-0000-0000-0000-000000000012', 'b1000000-0000-0000-0000-000000000001', 'T-12', 'qr_dera_t12_sec812'),
('70000000-0000-0000-0000-000000000021', 'b2000000-0000-0000-0000-000000000002', 'T-01', 'qr_sher_t01_sec501'),
('70000000-0000-0000-0000-000000000031', 'b3000000-0000-0000-0000-000000000003', 'T-01', 'qr_kotc_t01_sec301')
ON CONFLICT (branch_id, table_number) DO NOTHING;

-- 6. Insert All 20 Menu Categories
INSERT INTO menu_categories (id, name, slug, icon, sort_order) VALUES
('c1000000-0000-0000-0000-000000000001', 'Special Platters & Offers', 'special-platters', 'Flame', 1),
('c1000000-0000-0000-0000-000000000002', 'Fast Food Deals (1-21)', 'fast-food-deals', 'Sparkles', 2),
('c1000000-0000-0000-0000-000000000003', 'Fast Food', 'fast-food', 'Utensils', 3),
('c1000000-0000-0000-0000-000000000004', 'OK Special Pizza', 'ok-special-pizza', 'Pizza', 4),
('c1000000-0000-0000-0000-000000000005', 'OK Regular Pizza', 'ok-regular-pizza', 'Pizza', 5),
('c1000000-0000-0000-0000-000000000006', 'Chicken Karahi', 'chicken-karahi', 'CookingPot', 6),
('c1000000-0000-0000-0000-000000000007', 'Chicken Handi', 'chicken-handi', 'Soup', 7),
('c1000000-0000-0000-0000-000000000008', 'Mutton Karahi', 'mutton-karahi', 'CookingPot', 8),
('c1000000-0000-0000-0000-000000000009', 'Mutton Handi', 'mutton-handi', 'Soup', 9),
('c1000000-0000-0000-0000-000000000010', 'Bar B.Q', 'bar-bq', 'Flame', 10),
('c1000000-0000-0000-0000-000000000011', 'Soup', 'soup', 'Soup', 11),
('c1000000-0000-0000-0000-000000000012', 'Chinese Starter', 'chinese-starter', 'Drumstick', 12),
('c1000000-0000-0000-0000-000000000013', 'Chowmain', 'chowmain', 'Utensils', 13),
('c1000000-0000-0000-0000-000000000014', 'Rice', 'rice', 'Utensils', 14),
('c1000000-0000-0000-0000-000000000015', 'Chinese Gravy', 'chinese-gravy', 'CookingPot', 15),
('c1000000-0000-0000-0000-000000000016', 'Salad & Raita', 'salad-raita', 'Utensils', 16),
('c1000000-0000-0000-0000-000000000017', 'Tandoor', 'tandoor', 'Flame', 17),
('c1000000-0000-0000-0000-000000000018', 'Beverages', 'beverages', 'Coffee', 18),
('c1000000-0000-0000-0000-000000000019', 'Tea', 'tea', 'Coffee', 19),
('c1000000-0000-0000-0000-000000000020', 'Ice Cream', 'ice-cream', 'Coffee', 20)
ON CONFLICT (slug) DO NOTHING;

-- 7. Insert Default Merchant Bank Configuration
INSERT INTO merchant_bank_config (
    bank_name, account_title, account_number, iban, 
    jazzcash_till_number, jazzcash_account_name, 
    easypaisa_till_number, easypaisa_account_name
) VALUES (
    'Meezan Bank Limited', 'OK RESTAURANT JAMPUR', '01020304050607', 'PK42 MEZN 0001 0203 0405 0607',
    '0334-4683344', 'OK Restaurant Jampur',
    '0336-4683344', 'OK Restaurant Jampur'
);

-- 8. Insert Sample Menu Items
INSERT INTO menu_items (id, category_id, item_code, name, description, base_price, has_variants, image_url, is_available, sort_order) VALUES
('m1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 9991, 'June Deal!', '1 Large Pizza + 1 Medium Pizza + 1 Liter Next Cola Drink', 1495.00, FALSE, 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&auto=format&fit=crop&q=80', TRUE, 1),
('m1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 9992, 'Royal Platter', 'Chicken Karahi + Fried Rice + Tikka Boti + Kabab + 4 Person Roti + Raita & Salad + 1 Liter Bottle', 2495.00, FALSE, 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&auto=format&fit=crop&q=80', TRUE, 2),
('m1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000001', 9993, 'Grand Family Feast Deal 27', 'Family-style platter with multiple chicken/BBQ items, rice, naan/roti, salad & 1.5L drink', 3495.00, FALSE, 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80', TRUE, 3),
('m3000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000003', 101, 'Zinger Burger', 'Crispy spicy chicken breast fillet with lettuce & Mayo', 320.00, FALSE, 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80', TRUE, 1),
('m3000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000003', 102, 'Chicken Patty Burger', 'Classic chicken patty with fresh lettuce and sauce', 250.00, FALSE, 'https://images.unsplash.com/photo-1550547660-d9450f859349?w=600&auto=format&fit=crop&q=80', TRUE, 2),
('m6000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000006', 201, 'Desi Ghee Chicken Karahi', 'Authentic traditional chicken karahi prepared in pure Desi Ghee with ginger & green chillies', 1650.00, TRUE, 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=600&auto=format&fit=crop&q=80', TRUE, 1)
ON CONFLICT (id) DO NOTHING;

-- 9. Insert Menu Item Variants
INSERT INTO menu_item_variants (id, menu_item_id, name, price, sort_order) VALUES
('v6000000-0000-0000-0000-000000000001', 'm6000000-0000-0000-0000-000000000001', 'Half (0.5 KG)', 950.00, 1),
('v6000000-0000-0000-0000-000000000002', 'm6000000-0000-0000-0000-000000000001', 'Full (1.0 KG)', 1650.00, 2)
ON CONFLICT (id) DO NOTHING;

