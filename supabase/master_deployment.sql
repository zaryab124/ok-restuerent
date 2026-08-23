-- ============================================================================
-- OK RESTAURANT PLATFORM - ALL-IN-ONE COMPLETE MASTER DEPLOYMENT SCRIPT
-- Executes: Initial Schema + Security Hardening + RLS + RPCs + Seed Data + Auth Users
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. CREATE ALL SCHEMAS AND TABLES
-- ----------------------------------------------------------------------------

-- 1.1 Profiles Table
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE,
    full_name TEXT NOT NULL,
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'CUSTOMER' CHECK (role IN ('OWNER', 'BRANCH_ADMIN', 'KITCHEN', 'RIDER', 'CUSTOMER')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.2 Branches Table
CREATE TABLE IF NOT EXISTS branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    address TEXT NOT NULL,
    phone TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.3 Branch Capabilities Table
CREATE TABLE IF NOT EXISTS branch_capabilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE UNIQUE NOT NULL,
    dine_in_enabled BOOLEAN DEFAULT TRUE,
    takeaway_enabled BOOLEAN DEFAULT TRUE,
    delivery_enabled BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.4 Branch Users
CREATE TABLE IF NOT EXISTS branch_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('BRANCH_ADMIN', 'KITCHEN', 'RIDER')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, branch_id)
);

-- 1.5 Menu Categories
CREATE TABLE IF NOT EXISTS menu_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    icon TEXT,
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE
);

-- 1.6 Menu Items
CREATE TABLE IF NOT EXISTS menu_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID REFERENCES menu_categories(id) ON DELETE CASCADE NOT NULL,
    item_code INT,
    name TEXT NOT NULL,
    description TEXT,
    base_price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    has_variants BOOLEAN DEFAULT FALSE,
    image_url TEXT,
    is_available BOOLEAN DEFAULT TRUE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.7 Menu Item Variants
CREATE TABLE IF NOT EXISTS menu_item_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_item_id UUID REFERENCES menu_items(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    sort_order INT DEFAULT 0
);

-- 1.8 Restaurant Tables
CREATE TABLE IF NOT EXISTS tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE NOT NULL,
    table_number TEXT NOT NULL,
    qr_code_token TEXT UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(branch_id, table_number)
);

-- 1.9 Orders Table
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT UNIQUE NOT NULL,
    tracking_token UUID DEFAULT gen_random_uuid() NOT NULL,
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE NOT NULL,
    customer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    order_type TEXT NOT NULL CHECK (order_type IN ('DINE_IN', 'TAKEAWAY', 'DELIVERY')),
    table_id UUID REFERENCES tables(id) ON DELETE SET NULL,
    delivery_address TEXT,
    delivery_notes TEXT,
    subtotal NUMERIC(10, 2) NOT NULL,
    delivery_fee NUMERIC(10, 2) DEFAULT 0.00,
    total_amount NUMERIC(10, 2) NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'CASH' CHECK (payment_method IN ('CASH', 'JAZZCASH', 'EASYPAISA', 'CARD', 'ONLINE', 'TEST_PAYMENT')),
    payment_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'PAID', 'FAILED')),
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (
        status IN (
            'PENDING', 'CONFIRMED', 'REJECTED', 'PREPARING', 
            'READY', 'ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 
            'DELIVERED', 'COMPLETED', 'CANCELLED'
        )
    ),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.10 Order Items
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
    menu_item_id UUID REFERENCES menu_items(id) ON DELETE SET NULL,
    variant_id UUID REFERENCES menu_item_variants(id) ON DELETE SET NULL,
    item_name TEXT NOT NULL,
    variant_name TEXT,
    unit_price NUMERIC(10, 2) NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    subtotal_price NUMERIC(10, 2) NOT NULL,
    special_instructions TEXT
);

-- 1.11 Order Status History Table
CREATE TABLE IF NOT EXISTS order_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
    from_status TEXT,
    to_status TEXT NOT NULL,
    changed_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.12 Rider Assignments
CREATE TABLE IF NOT EXISTS rider_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE UNIQUE NOT NULL,
    rider_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'ACCEPTED' CHECK (status IN ('ACCEPTED', 'REJECTED', 'COMPLETED', 'FAILED'))
);

-- 1.13 Buffet Registrations
CREATE TABLE IF NOT EXISTS buffet_registrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    dishes_list TEXT[] NOT NULL,
    price_per_head NUMERIC(10, 2) NOT NULL,
    event_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    banner_image_url TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.14 Buffet Bookings
CREATE TABLE IF NOT EXISTS buffet_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    buffet_id UUID REFERENCES buffet_registrations(id) ON DELETE CASCADE NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_email TEXT,
    guests_count INT NOT NULL CHECK (guests_count > 0),
    total_amount NUMERIC(10, 2) NOT NULL,
    qr_ticket_token TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'CONFIRMED' CHECK (status IN ('CONFIRMED', 'CHECKED_IN', 'CANCELLED')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.15 Merchant Bank Configuration
CREATE TABLE IF NOT EXISTS merchant_bank_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_name TEXT NOT NULL DEFAULT 'Meezan Bank Limited',
    account_title TEXT NOT NULL DEFAULT 'OK RESTAURANT JAMPUR',
    account_number TEXT NOT NULL DEFAULT '01020304050607',
    iban TEXT NOT NULL DEFAULT 'PK42 MEZN 0001 0203 0405 0607',
    jazzcash_till_number TEXT NOT NULL DEFAULT '0334-4683344',
    jazzcash_account_name TEXT NOT NULL DEFAULT 'OK Restaurant Jampur',
    easypaisa_till_number TEXT NOT NULL DEFAULT '0336-4683344',
    easypaisa_account_name TEXT NOT NULL DEFAULT 'OK Restaurant Jampur',
    is_online_payment_active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 1.16 Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_orders_branch_id ON orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_tracking_token ON orders(tracking_token);

-- ----------------------------------------------------------------------------
-- 2. HELPER FUNCTIONS & RPCS
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION get_user_role(p_user_id UUID DEFAULT auth.uid())
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT role FROM profiles WHERE id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION is_owner(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id AND role = 'OWNER');
$$;

DROP FUNCTION IF EXISTS get_public_merchant_payment_info();
CREATE OR REPLACE FUNCTION get_public_merchant_payment_info()
RETURNS TABLE (
    bank_name TEXT,
    account_title TEXT,
    account_number TEXT,
    iban TEXT,
    jazzcash_till_number TEXT,
    jazzcash_account_name TEXT,
    easypaisa_till_number TEXT,
    easypaisa_account_name TEXT
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    RETURN QUERY
    SELECT m.bank_name, m.account_title, m.account_number, m.iban, m.jazzcash_till_number, m.jazzcash_account_name, m.easypaisa_till_number, m.easypaisa_account_name
    FROM merchant_bank_config m
    WHERE m.is_online_payment_active = TRUE
    LIMIT 1;
END;
$$;
GRANT EXECUTE ON FUNCTION get_public_merchant_payment_info() TO anon, authenticated;

-- Atomic Order Creation Function
DROP FUNCTION IF EXISTS create_order_atomic(UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, JSONB);
CREATE OR REPLACE FUNCTION create_order_atomic(
    p_branch_id UUID,
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_order_type TEXT,
    p_table_id UUID DEFAULT NULL,
    p_delivery_address TEXT DEFAULT NULL,
    p_delivery_notes TEXT DEFAULT NULL,
    p_payment_method TEXT DEFAULT 'CASH',
    p_items JSONB DEFAULT '[]'::jsonb
) RETURNS TABLE (
    out_order_id UUID,
    out_order_number TEXT,
    out_tracking_token UUID,
    out_total_amount NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_order_id UUID := gen_random_uuid();
    v_order_number TEXT;
    v_tracking_token UUID := gen_random_uuid();
    v_subtotal NUMERIC(10,2) := 0.00;
    v_delivery_fee NUMERIC(10,2) := 0.00;
    v_total NUMERIC(10,2) := 0.00;
    v_branch_active BOOLEAN;
    v_delivery_enabled BOOLEAN;
    v_dine_in_enabled BOOLEAN;
    v_takeaway_enabled BOOLEAN;
    v_table_valid BOOLEAN;
    v_item JSONB;
    v_menu_item_id UUID;
    v_variant_id UUID;
    v_quantity INT;
    v_unit_price NUMERIC(10,2);
    v_item_name TEXT;
    v_variant_name TEXT;
    v_item_subtotal NUMERIC(10,2);
    v_is_available BOOLEAN;
BEGIN
    IF p_customer_name IS NULL OR TRIM(p_customer_name) = '' THEN
        RAISE EXCEPTION 'Customer name is required.';
    END IF;
    IF p_customer_phone IS NULL OR TRIM(p_customer_phone) = '' THEN
        RAISE EXCEPTION 'Customer phone is required.';
    END IF;
    IF jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Cannot create an order with an empty items array.';
    END IF;

    SELECT is_active INTO v_branch_active FROM branches WHERE id = p_branch_id;
    IF v_branch_active IS NULL OR NOT v_branch_active THEN
        RAISE EXCEPTION 'Selected branch is invalid or inactive.';
    END IF;

    SELECT dine_in_enabled, takeaway_enabled, delivery_enabled 
    INTO v_dine_in_enabled, v_takeaway_enabled, v_delivery_enabled
    FROM branch_capabilities WHERE branch_id = p_branch_id;

    IF p_order_type = 'DELIVERY' THEN
        IF NOT COALESCE(v_delivery_enabled, FALSE) THEN
            RAISE EXCEPTION 'Delivery service is currently disabled for this branch.';
        END IF;
        IF p_delivery_address IS NULL OR TRIM(p_delivery_address) = '' THEN
            RAISE EXCEPTION 'Delivery address is required for delivery orders.';
        END IF;
        v_delivery_fee := 100.00;
    ELSIF p_order_type = 'DINE_IN' THEN
        IF NOT COALESCE(v_dine_in_enabled, TRUE) THEN
            RAISE EXCEPTION 'Dine-In service is currently disabled for this branch.';
        END IF;
        IF p_table_id IS NULL THEN
            RAISE EXCEPTION 'Table selection is required for Dine-In orders.';
        END IF;
        SELECT EXISTS (
            SELECT 1 FROM tables WHERE id = p_table_id AND branch_id = p_branch_id AND is_active = TRUE
        ) INTO v_table_valid;
        IF NOT v_table_valid THEN
            RAISE EXCEPTION 'Invalid or inactive table selected for this branch.';
        END IF;
    ELSIF p_order_type = 'TAKEAWAY' THEN
        IF NOT COALESCE(v_takeaway_enabled, TRUE) THEN
            RAISE EXCEPTION 'Takeaway service is currently disabled for this branch.';
        END IF;
    ELSE
        RAISE EXCEPTION 'Invalid order type "%".', p_order_type;
    END IF;

    LOOP
        v_order_number := 'OK-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(gen_random_uuid()::text FROM 1 FOR 6));
        EXIT WHEN NOT EXISTS (SELECT 1 FROM orders o WHERE o.order_number = v_order_number);
    END LOOP;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_menu_item_id := (v_item->>'menu_item_id')::UUID;
        v_variant_id := CASE WHEN (v_item->>'variant_id') IS NOT NULL AND (v_item->>'variant_id') != '' THEN (v_item->>'variant_id')::UUID ELSE NULL END;
        v_quantity := (v_item->>'quantity')::INT;

        IF v_quantity IS NULL OR v_quantity <= 0 OR v_quantity > 100 THEN
            RAISE EXCEPTION 'Invalid quantity % for item.', v_quantity;
        END IF;

        SELECT m.name, m.base_price, m.is_available INTO v_item_name, v_unit_price, v_is_available
        FROM menu_items m WHERE m.id = v_menu_item_id;

        IF v_item_name IS NULL THEN
            RAISE EXCEPTION 'Menu item % not found.', v_menu_item_id;
        END IF;
        IF NOT COALESCE(v_is_available, FALSE) THEN
            RAISE EXCEPTION 'Menu item "%" is currently unavailable.', v_item_name;
        END IF;

        IF v_variant_id IS NOT NULL THEN
            SELECT mv.name, mv.price INTO v_variant_name, v_unit_price
            FROM menu_item_variants mv
            WHERE mv.id = v_variant_id AND mv.menu_item_id = v_menu_item_id;

            IF v_variant_name IS NULL THEN
                RAISE EXCEPTION 'Selected variant not found for menu item "%".', v_item_name;
            END IF;
        ELSE
            v_variant_name := NULL;
        END IF;

        v_item_subtotal := v_unit_price * v_quantity;
        v_subtotal := v_subtotal + v_item_subtotal;
    END LOOP;

    v_total := v_subtotal + v_delivery_fee;

    INSERT INTO orders (
        id, order_number, tracking_token, branch_id, customer_id, customer_name, customer_phone,
        order_type, table_id, delivery_address, delivery_notes, subtotal, delivery_fee, total_amount,
        payment_method, payment_status, status
    ) VALUES (
        v_order_id, v_order_number, v_tracking_token, p_branch_id, auth.uid(), p_customer_name, p_customer_phone,
        p_order_type, p_table_id, p_delivery_address, p_delivery_notes, v_subtotal, v_delivery_fee, v_total,
        p_payment_method, 'PENDING', 'PENDING'
    );

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_menu_item_id := (v_item->>'menu_item_id')::UUID;
        v_variant_id := CASE WHEN (v_item->>'variant_id') IS NOT NULL AND (v_item->>'variant_id') != '' THEN (v_item->>'variant_id')::UUID ELSE NULL END;
        v_quantity := (v_item->>'quantity')::INT;

        SELECT m.name, m.base_price INTO v_item_name, v_unit_price FROM menu_items m WHERE m.id = v_menu_item_id;
        IF v_variant_id IS NOT NULL THEN
            SELECT mv.name, mv.price INTO v_variant_name, v_unit_price FROM menu_item_variants mv WHERE mv.id = v_variant_id AND mv.menu_item_id = v_menu_item_id;
        ELSE
            v_variant_name := NULL;
        END IF;

        v_item_subtotal := v_unit_price * v_quantity;

        INSERT INTO order_items (
            id, order_id, menu_item_id, variant_id, item_name, variant_name, unit_price, quantity, subtotal_price, special_instructions
        ) VALUES (
            gen_random_uuid(), v_order_id, v_menu_item_id, v_variant_id, v_item_name, v_variant_name, v_unit_price, v_quantity, v_item_subtotal, v_item->>'special_instructions'
        );
    END LOOP;

    INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_user_id, notes)
    VALUES (gen_random_uuid(), v_order_id, NULL, 'PENDING', auth.uid(), 'Order placed successfully');

    RETURN QUERY SELECT v_order_id, v_order_number, v_tracking_token, v_total;
END;
$$;
GRANT EXECUTE ON FUNCTION create_order_atomic(UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, JSONB) TO anon, authenticated;

-- Claim Delivery Order Function
CREATE OR REPLACE FUNCTION claim_delivery_order(
    p_order_id UUID,
    p_rider_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_current_status TEXT;
BEGIN
    SELECT status INTO v_current_status FROM orders WHERE id = p_order_id FOR UPDATE;
    IF v_current_status != 'READY' THEN
        RETURN FALSE;
    END IF;

    BEGIN
        INSERT INTO rider_assignments (order_id, rider_id, status)
        VALUES (p_order_id, p_rider_id, 'ACCEPTED');
    EXCEPTION WHEN UNIQUE_VIOLATION THEN
        RETURN FALSE;
    END;

    UPDATE orders SET status = 'ASSIGNED', updated_at = NOW() WHERE id = p_order_id;
    INSERT INTO order_status_history (order_id, from_status, to_status, changed_by_user_id, notes)
    VALUES (p_order_id, 'READY', 'ASSIGNED', p_rider_id, 'Rider claimed delivery order');

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION claim_delivery_order(UUID, UUID) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3. SEED BRANCHES, CAPABILITIES, CATEGORIES, MENU, TABLES & BANK CONFIG
-- ----------------------------------------------------------------------------

INSERT INTO branches (id, name, slug, address, phone, is_active) VALUES
('b1000000-0000-0000-0000-000000000001', 'Dera Chungi', 'dera-chungi', 'Indus Highway, Dera Chungi, Jampur', '0334-4683344', TRUE),
('b2000000-0000-0000-0000-000000000002', 'Sherifalon Bypass Road', 'sherifalon', 'Sherifalon Bypass, Near Govt School, Jampur', '0336-4683344', TRUE),
('b3000000-0000-0000-0000-000000000003', 'Kot Chuta / Appo Chuta', 'kot-chuta', 'Indus Highway, Kot Chuta', '0333-2225757', TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, address = EXCLUDED.address, phone = EXCLUDED.phone;

INSERT INTO branch_capabilities (id, branch_id, dine_in_enabled, takeaway_enabled, delivery_enabled) VALUES
('c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', TRUE, TRUE, TRUE),
('c2000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000002', TRUE, TRUE, FALSE),
('c3000000-0000-0000-0000-000000000003', 'b3000000-0000-0000-0000-000000000003', TRUE, TRUE, FALSE)
ON CONFLICT (branch_id) DO UPDATE SET delivery_enabled = EXCLUDED.delivery_enabled;

INSERT INTO menu_categories (id, name, slug, icon, sort_order, is_active) VALUES
('c1000000-0000-0000-0000-000000000001', 'Special Deals', 'deals', 'Gift', 1, TRUE),
('c1000000-0000-0000-0000-000000000002', 'Pizza & Fast Food', 'pizza', 'Pizza', 2, TRUE),
('c1000000-0000-0000-0000-000000000003', 'Burgers & Wraps', 'burgers', 'Utensils', 3, TRUE),
('c1000000-0000-0000-0000-000000000004', 'BBQ & Tikka', 'bbq', 'Flame', 4, TRUE),
('c1000000-0000-0000-0000-000000000005', 'Desi Karahi & Handi', 'karahi', 'CookingPot', 5, TRUE),
('c1000000-0000-0000-0000-000000000006', 'Beverages & Desserts', 'drinks', 'Coffee', 6, TRUE)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO menu_items (id, category_id, item_code, name, description, base_price, has_variants, image_url, is_available, sort_order) VALUES
('d1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 9991, 'June Deal!', '1 Large Pizza + 1 Medium Pizza + 1 Liter Next Cola Drink', 1495.00, FALSE, 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&auto=format&fit=crop&q=80', TRUE, 1),
('d1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 9992, 'Royal Platter', 'Chicken Karahi + Fried Rice + Tikka Boti + Kabab + 4 Person Roti + Raita & Salad', 2495.00, FALSE, 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&auto=format&fit=crop&q=80', TRUE, 2),
('d3000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000003', 101, 'Zinger Burger', 'Crispy spicy chicken breast fillet with lettuce & Mayo', 320.00, FALSE, 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&auto=format&fit=crop&q=80', TRUE, 1),
('d6000000-0000-0000-0000-000000000006', 'c1000000-0000-0000-0000-000000000006', 201, 'Desi Ghee Chicken Karahi', 'Authentic traditional chicken karahi prepared in pure Desi Ghee', 1650.00, TRUE, 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=600&auto=format&fit=crop&q=80', TRUE, 1)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, base_price = EXCLUDED.base_price, is_available = EXCLUDED.is_available;

INSERT INTO menu_item_variants (id, menu_item_id, name, price, sort_order) VALUES
('f6000000-0000-0000-0000-000000000001', 'd6000000-0000-0000-0000-000000000006', 'Half (0.5 KG)', 950.00, 1),
('f6000000-0000-0000-0000-000000000002', 'd6000000-0000-0000-0000-000000000006', 'Full (1.0 KG)', 1650.00, 2)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price;

INSERT INTO tables (id, branch_id, table_number, qr_code_token, is_active) VALUES
('t1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'T-01', 'dera-table-01-token', TRUE),
('t1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'T-02', 'dera-table-02-token', TRUE)
ON CONFLICT (id) DO UPDATE SET is_active = TRUE;

INSERT INTO merchant_bank_config (id, bank_name, account_title, account_number, iban, jazzcash_till_number, jazzcash_account_name, easypaisa_till_number, easypaisa_account_name, is_online_payment_active)
VALUES ('m1000000-0000-0000-0000-000000000001', 'Meezan Bank Limited', 'OK RESTAURANT JAMPUR', '01020304050607', 'PK42 MEZN 0001 0203 0405 0607', '0334-4683344', 'OK Restaurant Jampur', '0336-4683344', 'OK Restaurant Jampur', TRUE)
ON CONFLICT (id) DO UPDATE SET is_online_payment_active = TRUE;

-- ----------------------------------------------------------------------------
-- 4. SEED STAFF AND DEMO ACCOUNTS INTO AUTH.USERS & PUBLIC.PROFILES
-- ----------------------------------------------------------------------------

DO $$
DECLARE
    v_password_hash TEXT := crypt('okaykarubas12390', gen_salt('bf', 10));
    v_user RECORD;
    v_users JSONB := '[
        {"id": "10000000-0000-0000-0000-000000000001", "email": "owner1@okrestaurant.com", "name": "Muhammad Ibrahim (Owner 1)", "phone": "0333-4683344", "role": "OWNER"},
        {"id": "10000000-0000-0000-0000-000000000002", "email": "owner2@okrestaurant.com", "name": "Sheikh Farooq (Owner 2)", "phone": "0333-5551122", "role": "OWNER"},
        {"id": "10000000-0000-0000-0000-000000000003", "email": "owner3@okrestaurant.com", "name": "Malik Usman (Owner 3)", "phone": "0333-9994455", "role": "OWNER"},
        {"id": "20000000-0000-0000-0000-000000000002", "email": "admin.dera@okrestaurant.com", "name": "Tariq Admin (Dera Chungi)", "phone": "0334-4683344", "role": "BRANCH_ADMIN"},
        {"id": "20000000-0000-0000-0000-000000000003", "email": "admin.sherifalon@okrestaurant.com", "name": "Sajjad Admin (Sherifalon)", "phone": "0336-4683344", "role": "BRANCH_ADMIN"},
        {"id": "20000000-0000-0000-0000-000000000004", "email": "admin.kotchuta@okrestaurant.com", "name": "Rashid Admin (Kot Chuta)", "phone": "0333-2225757", "role": "BRANCH_ADMIN"},
        {"id": "30000000-0000-0000-0000-000000000001", "email": "kitchen.dera@okrestaurant.com", "name": "Chef Ahmad (Dera Kitchen)", "phone": "0300-1112233", "role": "KITCHEN"},
        {"id": "30000000-0000-0000-0000-000000000002", "email": "kitchen.sherifalon@okrestaurant.com", "name": "Chef Bilal (Sherifalon Kitchen)", "phone": "0300-4445566", "role": "KITCHEN"},
        {"id": "30000000-0000-0000-0000-000000000003", "email": "kitchen.kotchuta@okrestaurant.com", "name": "Chef Tariq (Kot Chuta Kitchen)", "phone": "0300-7778899", "role": "KITCHEN"},
        {"id": "40000000-0000-0000-0000-000000000001", "email": "rider1.dera@okrestaurant.com", "name": "Ali Rider (Dera Delivery)", "phone": "0301-9998877", "role": "RIDER"},
        {"id": "40000000-0000-0000-0000-000000000002", "email": "rider2.dera@okrestaurant.com", "name": "Hamza Rider (Dera Delivery)", "phone": "0301-3332211", "role": "RIDER"},
        {"id": "40000000-0000-0000-0000-000000000003", "email": "rider.sherifalon@okrestaurant.com", "name": "Zubair Rider (Sherifalon Delivery)", "phone": "0301-6665544", "role": "RIDER"},
        {"id": "40000000-0000-0000-0000-000000000004", "email": "rider.kotchuta@okrestaurant.com", "name": "Imran Rider (Kot Chuta Delivery)", "phone": "0301-8887766", "role": "RIDER"},
        {"id": "50000000-0000-0000-0000-000000000001", "email": "customer.demo@gmail.com", "name": "Usman Customer", "phone": "0321-5554433", "role": "CUSTOMER"}
    ]'::jsonb;
BEGIN
    FOR v_user IN SELECT * FROM jsonb_to_recordset(v_users) AS x(id UUID, email TEXT, name TEXT, phone TEXT, role TEXT)
    LOOP
        DELETE FROM auth.identities WHERE user_id = v_user.id OR provider_id = v_user.id::text;
        
        INSERT INTO auth.users (
            instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at
        ) VALUES (
            '00000000-0000-0000-0000-000000000000', v_user.id, 'authenticated', 'authenticated',
            LOWER(v_user.email), v_password_hash, NOW(),
            '{"provider": "email", "providers": ["email"]}'::jsonb,
            jsonb_build_object('full_name', v_user.name, 'phone', v_user.phone),
            NOW(), NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
            instance_id = '00000000-0000-0000-0000-000000000000',
            encrypted_password = v_password_hash,
            email_confirmed_at = NOW(),
            updated_at = NOW();

        INSERT INTO auth.identities (
            id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
        ) VALUES (
            v_user.id, v_user.id,
            jsonb_build_object('sub', v_user.id::text, 'email', LOWER(v_user.email)),
            'email', v_user.id::text, NOW(), NOW(), NOW()
        );

        INSERT INTO public.profiles (id, email, full_name, phone, role)
        VALUES (v_user.id, LOWER(v_user.email), v_user.name, v_user.phone, v_user.role)
        ON CONFLICT (id) DO UPDATE SET
            email = EXCLUDED.email, full_name = EXCLUDED.full_name,
            phone = EXCLUDED.phone, role = EXCLUDED.role;
    END LOOP;
END $$;
