-- OK Restaurant Platform Security Hardening & RLS Migration
-- Migration 002: Security Hardening, RPCs, and Row Level Security (RLS)

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Schema Enhancements & Indexes
-- Add tracking_token column to orders table if not present
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'orders' AND column_name = 'tracking_token'
    ) THEN
        ALTER TABLE orders ADD COLUMN tracking_token UUID DEFAULT gen_random_uuid();
    END IF;
END $$;

-- Populate tracking_token for existing orders if any
UPDATE orders SET tracking_token = gen_random_uuid() WHERE tracking_token IS NULL;

-- Enforce NOT NULL constraint and UNIQUE index on tracking_token
ALTER TABLE orders ALTER COLUMN tracking_token SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_tracking_token ON orders(tracking_token);

-- Ensure payment_method check constraint is up-to-date
DO $$
BEGIN
    ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
    ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check 
    CHECK (payment_method IN ('CASH', 'JAZZCASH', 'EASYPAISA', 'CARD', 'ONLINE', 'TEST_PAYMENT'));
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- 3. Security Definer Helper Functions (Avoid RLS Recursion)
CREATE OR REPLACE FUNCTION get_user_role(p_user_id UUID DEFAULT auth.uid())
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT role FROM profiles WHERE id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION is_owner(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id AND role = 'OWNER');
$$;

CREATE OR REPLACE FUNCTION is_staff_of_branch(p_branch_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT EXISTS (
        SELECT 1 FROM branch_users WHERE user_id = p_user_id AND branch_id = p_branch_id
    ) OR EXISTS (
        SELECT 1 FROM profiles WHERE id = p_user_id AND role = 'OWNER'
    );
$$;

CREATE OR REPLACE FUNCTION is_rider(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT EXISTS (
        SELECT 1 FROM profiles WHERE id = p_user_id AND (role = 'RIDER' OR role = 'OWNER')
    );
$$;

-- 4. Auth User Profile Trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, phone, role)
    VALUES (
        NEW.id,
        LOWER(NEW.email),
        COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'phone', ''),
        'CUSTOMER'
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone,
        updated_at = NOW();

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Secure RPC Functions

-- RPC 5.1: QR Token Validation
CREATE OR REPLACE FUNCTION validate_qr_token(p_token TEXT)
RETURNS TABLE (
    table_id UUID,
    table_number TEXT,
    branch_id UUID,
    branch_name TEXT,
    branch_slug TEXT
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT 
        t.id AS table_id,
        t.table_number,
        b.id AS branch_id,
        b.name AS branch_name,
        b.slug AS branch_slug
    FROM tables t
    JOIN branches b ON b.id = t.branch_id
    WHERE t.qr_code_token = p_token 
      AND t.is_active = TRUE 
      AND b.is_active = TRUE;
$$;

-- RPC 5.2: Public Merchant Payment Info
CREATE OR REPLACE FUNCTION get_public_merchant_payment_info()
RETURNS TABLE (
    bank_name TEXT,
    account_title TEXT,
    account_number TEXT,
    iban TEXT,
    jazzcash_till_number TEXT,
    jazzcash_account_name TEXT,
    easypaisa_till_number TEXT,
    easypaisa_account_name TEXT,
    is_online_payment_active BOOLEAN
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT 
        bank_name, account_title, account_number, iban,
        jazzcash_till_number, jazzcash_account_name,
        easypaisa_till_number, easypaisa_account_name,
        is_online_payment_active
    FROM merchant_bank_config
    WHERE is_online_payment_active = TRUE
    LIMIT 1;
$$;

-- RPC 5.3: Order Tracking by Token
CREATE OR REPLACE FUNCTION get_order_by_tracking_token(p_tracking_token UUID)
RETURNS TABLE (
    order_id UUID,
    order_number TEXT,
    tracking_token UUID,
    branch_id UUID,
    customer_name TEXT,
    customer_phone TEXT,
    order_type TEXT,
    table_id UUID,
    delivery_address TEXT,
    delivery_notes TEXT,
    subtotal NUMERIC,
    delivery_fee NUMERIC,
    total_amount NUMERIC,
    payment_method TEXT,
    payment_status TEXT,
    status TEXT,
    created_at TIMESTAMPTZ,
    items JSONB,
    history JSONB
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.id AS order_id,
        o.order_number,
        o.tracking_token,
        o.branch_id,
        o.customer_name,
        o.customer_phone,
        o.order_type,
        o.table_id,
        o.delivery_address,
        o.delivery_notes,
        o.subtotal,
        o.delivery_fee,
        o.total_amount,
        o.payment_method,
        o.payment_status,
        o.status,
        o.created_at,
        COALESCE(
            (SELECT jsonb_agg(jsonb_build_object(
                'id', oi.id,
                'menu_item_id', oi.menu_item_id,
                'variant_id', oi.variant_id,
                'item_name', oi.item_name,
                'variant_name', oi.variant_name,
                'unit_price', oi.unit_price,
                'quantity', oi.quantity,
                'subtotal_price', oi.subtotal_price,
                'special_instructions', oi.special_instructions
            )) FROM order_items oi WHERE oi.order_id = o.id),
            '[]'::jsonb
        ) AS items,
        COALESCE(
            (SELECT jsonb_agg(jsonb_build_object(
                'id', h.id,
                'from_status', h.from_status,
                'to_status', h.to_status,
                'notes', h.notes,
                'created_at', h.created_at
            )) FROM order_status_history h WHERE h.order_id = o.id),
            '[]'::jsonb
        ) AS history
    FROM orders o
    WHERE o.tracking_token = p_tracking_token;
END;
$$;

-- RPC 5.4: Atomic Order Creation (Hardened Server-side Pricing & Validation)
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
    -- 1. Validate Basic Parameters
    IF p_customer_name IS NULL OR TRIM(p_customer_name) = '' THEN
        RAISE EXCEPTION 'Customer name is required.';
    END IF;
    IF p_customer_phone IS NULL OR TRIM(p_customer_phone) = '' THEN
        RAISE EXCEPTION 'Customer phone is required.';
    END IF;
    IF jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Cannot create an order with an empty items array.';
    END IF;

    -- 2. Validate Branch & Status
    SELECT is_active INTO v_branch_active FROM branches WHERE id = p_branch_id;
    IF v_branch_active IS NULL OR NOT v_branch_active THEN
        RAISE EXCEPTION 'Selected branch is invalid or inactive.';
    END IF;

    -- 3. Validate Order Type & Capabilities
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

    -- 4. Generate Collision-Resistant Order Number
    v_order_number := 'OK-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(gen_random_uuid()::text FROM 1 FOR 6));

    -- 5. Calculate Authoritative Server-side Prices and Validate Items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_menu_item_id := (v_item->>'menu_item_id')::UUID;
        v_variant_id := CASE WHEN (v_item->>'variant_id') IS NOT NULL AND (v_item->>'variant_id') != '' THEN (v_item->>'variant_id')::UUID ELSE NULL END;
        v_quantity := (v_item->>'quantity')::INT;

        IF v_quantity IS NULL OR v_quantity <= 0 OR v_quantity > 100 THEN
            RAISE EXCEPTION 'Invalid quantity % for item.', v_quantity;
        END IF;

        -- Fetch menu item details & availability
        SELECT name, base_price, is_available INTO v_item_name, v_unit_price, v_is_available
        FROM menu_items WHERE id = v_menu_item_id;

        IF v_item_name IS NULL THEN
            RAISE EXCEPTION 'Menu item % not found.', v_menu_item_id;
        END IF;
        IF NOT COALESCE(v_is_available, FALSE) THEN
            RAISE EXCEPTION 'Menu item "%" is currently unavailable.', v_item_name;
        END IF;

        -- Override unit price if variant specified
        IF v_variant_id IS NOT NULL THEN
            SELECT name, price INTO v_variant_name, v_unit_price
            FROM menu_item_variants 
            WHERE id = v_variant_id AND menu_item_id = v_menu_item_id;

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

    -- 6. INSERT into orders FIRST (Parent table)
    INSERT INTO orders (
        id, order_number, tracking_token, branch_id, customer_id, customer_name, customer_phone,
        order_type, table_id, delivery_address, delivery_notes, subtotal, delivery_fee, total_amount,
        payment_method, payment_status, status
    ) VALUES (
        v_order_id, v_order_number, v_tracking_token, p_branch_id, auth.uid(), p_customer_name, p_customer_phone,
        p_order_type, p_table_id, p_delivery_address, p_delivery_notes, v_subtotal, v_delivery_fee, v_total,
        p_payment_method, 'PENDING', 'PENDING'
    );

    -- 7. INSERT into order_items SECOND (Child table referencing orders.id)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_menu_item_id := (v_item->>'menu_item_id')::UUID;
        v_variant_id := CASE WHEN (v_item->>'variant_id') IS NOT NULL AND (v_item->>'variant_id') != '' THEN (v_item->>'variant_id')::UUID ELSE NULL END;
        v_quantity := (v_item->>'quantity')::INT;

        SELECT name, base_price INTO v_item_name, v_unit_price FROM menu_items WHERE id = v_menu_item_id;
        IF v_variant_id IS NOT NULL THEN
            SELECT name, price INTO v_variant_name, v_unit_price FROM menu_item_variants WHERE id = v_variant_id;
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

    -- 8. INSERT into order_status_history THIRD
    INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_user_id, notes)
    VALUES (gen_random_uuid(), v_order_id, NULL, 'PENDING', auth.uid(), 'Order placed successfully');

    RETURN QUERY SELECT v_order_id, v_order_number, v_tracking_token, v_total;
END;
$$;

-- RPC 5.5: Secure Order Status Transition Engine
CREATE OR REPLACE FUNCTION update_order_status_secure(
    p_order_id UUID,
    p_new_status TEXT,
    p_notes TEXT DEFAULT NULL
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_current_status TEXT;
    v_branch_id UUID;
    v_customer_id UUID;
    v_assigned_rider_id UUID;
    v_user_role TEXT := get_user_role();
    v_valid_transition BOOLEAN := FALSE;
BEGIN
    -- Select with row-level lock
    SELECT status, branch_id, customer_id INTO v_current_status, v_branch_id, v_customer_id
    FROM orders WHERE id = p_order_id FOR UPDATE;

    IF v_current_status IS NULL THEN
        RAISE EXCEPTION 'Order not found.';
    END IF;

    -- Get assigned rider if any
    SELECT rider_id INTO v_assigned_rider_id FROM rider_assignments WHERE order_id = p_order_id;

    -- Transition Matrix Validation
    IF v_current_status = 'PENDING' AND p_new_status IN ('CONFIRMED', 'REJECTED', 'CANCELLED') THEN v_valid_transition := TRUE;
    ELSIF v_current_status = 'CONFIRMED' AND p_new_status IN ('PREPARING', 'CANCELLED') THEN v_valid_transition := TRUE;
    ELSIF v_current_status = 'PREPARING' AND p_new_status IN ('READY', 'CANCELLED') THEN v_valid_transition := TRUE;
    ELSIF v_current_status = 'READY' AND p_new_status IN ('ASSIGNED', 'COMPLETED', 'CANCELLED') THEN v_valid_transition := TRUE;
    ELSIF v_current_status = 'ASSIGNED' AND p_new_status IN ('PICKED_UP', 'CANCELLED') THEN v_valid_transition := TRUE;
    ELSIF v_current_status = 'PICKED_UP' AND p_new_status IN ('OUT_FOR_DELIVERY', 'CANCELLED') THEN v_valid_transition := TRUE;
    ELSIF v_current_status = 'OUT_FOR_DELIVERY' AND p_new_status IN ('DELIVERED', 'COMPLETED', 'CANCELLED') THEN v_valid_transition := TRUE;
    END IF;

    IF NOT v_valid_transition THEN
        RAISE EXCEPTION 'Invalid status transition from % to %.', v_current_status, p_new_status;
    END IF;

    -- Role Authorization Enforcements
    IF is_owner() THEN
        -- OWNER authorized for all transitions
    ELSIF v_user_role = 'BRANCH_ADMIN' AND is_staff_of_branch(v_branch_id) THEN
        -- BRANCH_ADMIN authorized for assigned branch
    ELSIF v_user_role = 'KITCHEN' AND is_staff_of_branch(v_branch_id) THEN
        -- KITCHEN limited to PENDING->CONFIRMED, CONFIRMED->PREPARING, PREPARING->READY
        IF NOT (
            (v_current_status = 'PENDING' AND p_new_status = 'CONFIRMED') OR
            (v_current_status = 'CONFIRMED' AND p_new_status = 'PREPARING') OR
            (v_current_status = 'PREPARING' AND p_new_status = 'READY')
        ) THEN
            RAISE EXCEPTION 'Kitchen staff is not authorized for status transition % -> %.', v_current_status, p_new_status;
        END IF;
    ELSIF v_user_role = 'RIDER' AND v_assigned_rider_id = auth.uid() THEN
        -- RIDER limited to assigned delivery orders transitions
        IF NOT (
            (v_current_status = 'READY' AND p_new_status = 'ASSIGNED') OR
            (v_current_status = 'ASSIGNED' AND p_new_status = 'PICKED_UP') OR
            (v_current_status = 'PICKED_UP' AND p_new_status = 'OUT_FOR_DELIVERY') OR
            (v_current_status = 'OUT_FOR_DELIVERY' AND p_new_status = 'DELIVERED')
        ) THEN
            RAISE EXCEPTION 'Rider is not authorized for status transition % -> %.', v_current_status, p_new_status;
        END IF;
    ELSIF v_customer_id = auth.uid() AND v_current_status = 'PENDING' AND p_new_status = 'CANCELLED' THEN
        -- CUSTOMER authorized to cancel own PENDING order
    ELSE
        RAISE EXCEPTION 'Unauthorized to update order status.';
    END IF;

    -- Perform Update
    UPDATE orders SET status = p_new_status, updated_at = NOW() WHERE id = p_order_id;

    -- Record Status History Log
    INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_user_id, notes)
    VALUES (gen_random_uuid(), p_order_id, v_current_status, p_new_status, auth.uid(), COALESCE(p_notes, 'Status updated to ' || p_new_status));

    RETURN TRUE;
END;
$$;

-- RPC 5.6: Hardened Rider Claim Order Function
CREATE OR REPLACE FUNCTION claim_delivery_order(
    p_order_id UUID,
    p_rider_id UUID DEFAULT auth.uid()
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_current_status TEXT;
    v_order_type TEXT;
    v_branch_id UUID;
    v_rider_role TEXT := get_user_role(p_rider_id);
BEGIN
    -- Verify caller identity and role
    IF auth.uid() IS NULL OR (auth.uid() != p_rider_id AND NOT is_owner()) THEN
        RAISE EXCEPTION 'Unauthorized rider identity.';
    END IF;

    IF v_rider_role != 'RIDER' AND NOT is_owner() THEN
        RAISE EXCEPTION 'User is not a registered rider.';
    END IF;

    -- Lock order row
    SELECT status, order_type, branch_id INTO v_current_status, v_order_type, v_branch_id
    FROM orders WHERE id = p_order_id FOR UPDATE;

    IF v_current_status IS NULL THEN
        RAISE EXCEPTION 'Order not found.';
    END IF;

    IF v_order_type != 'DELIVERY' THEN
        RAISE EXCEPTION 'Only delivery orders can be claimed by riders.';
    END IF;

    IF v_current_status != 'READY' THEN
        RAISE EXCEPTION 'Order is not in READY state for claiming.';
    END IF;

    -- Verify rider belongs to order's branch
    IF NOT is_staff_of_branch(v_branch_id, p_rider_id) THEN
        RAISE EXCEPTION 'Rider is not assigned to order branch.';
    END IF;

    -- Insert Rider Assignment (Fails on duplicate due to UNIQUE constraint)
    BEGIN
        INSERT INTO rider_assignments (id, order_id, rider_id, status)
        VALUES (gen_random_uuid(), p_order_id, p_rider_id, 'ACCEPTED');
    EXCEPTION WHEN UNIQUE_VIOLATION THEN
        RAISE EXCEPTION 'Order has already been claimed by another rider.';
    END;

    -- Update Order Status
    UPDATE orders SET status = 'ASSIGNED', updated_at = NOW() WHERE id = p_order_id;

    -- Record Status History
    INSERT INTO order_status_history (id, order_id, from_status, to_status, changed_by_user_id, notes)
    VALUES (gen_random_uuid(), p_order_id, 'READY', 'ASSIGNED', p_rider_id, 'Delivery order claimed by rider');

    RETURN TRUE;
END;
$$;

-- 6. Enable Row Level Security (RLS) on All 16 Tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE branch_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_item_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE rider_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE buffet_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE buffet_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_bank_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- 7. Define RLS Policies for Every Table

-- 7.1 Table: profiles
DROP POLICY IF EXISTS "profiles_select_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON profiles;
DROP POLICY IF EXISTS "profiles_delete_policy" ON profiles;

CREATE POLICY "profiles_select_policy" ON profiles FOR SELECT USING (
    id = auth.uid() OR is_owner()
);

CREATE POLICY "profiles_insert_policy" ON profiles FOR INSERT WITH CHECK (
    (id = auth.uid() AND role = 'CUSTOMER') OR is_owner()
);

CREATE POLICY "profiles_update_policy" ON profiles FOR UPDATE
USING (
    id = auth.uid() OR is_owner()
)
WITH CHECK (
    (id = auth.uid() AND role = get_user_role(auth.uid())) OR is_owner()
);

CREATE POLICY "profiles_delete_policy" ON profiles FOR DELETE USING (
    is_owner()
);

-- 7.2 Table: branches
DROP POLICY IF EXISTS "branches_select_policy" ON branches;
DROP POLICY IF EXISTS "branches_modify_policy" ON branches;

CREATE POLICY "branches_select_policy" ON branches FOR SELECT USING (
    is_active = TRUE OR auth.uid() IS NOT NULL
);

CREATE POLICY "branches_modify_policy" ON branches FOR ALL USING (
    is_owner()
);

-- 7.3 Table: branch_capabilities
DROP POLICY IF EXISTS "branch_capabilities_select_policy" ON branch_capabilities;
DROP POLICY IF EXISTS "branch_capabilities_update_policy" ON branch_capabilities;
DROP POLICY IF EXISTS "branch_capabilities_modify_policy" ON branch_capabilities;

CREATE POLICY "branch_capabilities_select_policy" ON branch_capabilities FOR SELECT USING (
    TRUE
);

CREATE POLICY "branch_capabilities_update_policy" ON branch_capabilities FOR UPDATE USING (
    is_owner() OR (get_user_role() = 'BRANCH_ADMIN' AND is_staff_of_branch(branch_id))
);

CREATE POLICY "branch_capabilities_modify_policy" ON branch_capabilities FOR INSERT WITH CHECK (
    is_owner()
);

-- 7.4 Table: branch_users
DROP POLICY IF EXISTS "branch_users_select_policy" ON branch_users;
DROP POLICY IF EXISTS "branch_users_modify_policy" ON branch_users;

CREATE POLICY "branch_users_select_policy" ON branch_users FOR SELECT USING (
    user_id = auth.uid() OR is_owner()
);

CREATE POLICY "branch_users_modify_policy" ON branch_users FOR ALL USING (
    is_owner()
);

-- 7.5 Table: menu_categories
DROP POLICY IF EXISTS "menu_categories_select_policy" ON menu_categories;
DROP POLICY IF EXISTS "menu_categories_modify_policy" ON menu_categories;

CREATE POLICY "menu_categories_select_policy" ON menu_categories FOR SELECT USING (
    is_active = TRUE OR auth.uid() IS NOT NULL
);

CREATE POLICY "menu_categories_modify_policy" ON menu_categories FOR ALL USING (
    is_owner() OR get_user_role() = 'BRANCH_ADMIN'
);

-- 7.6 Table: menu_items
DROP POLICY IF EXISTS "menu_items_select_policy" ON menu_items;
DROP POLICY IF EXISTS "menu_items_modify_policy" ON menu_items;

CREATE POLICY "menu_items_select_policy" ON menu_items FOR SELECT USING (
    is_available = TRUE OR auth.uid() IS NOT NULL
);

CREATE POLICY "menu_items_modify_policy" ON menu_items FOR ALL USING (
    is_owner() OR get_user_role() IN ('BRANCH_ADMIN', 'KITCHEN')
);

-- 7.7 Table: menu_item_variants
DROP POLICY IF EXISTS "menu_item_variants_select_policy" ON menu_item_variants;
DROP POLICY IF EXISTS "menu_item_variants_modify_policy" ON menu_item_variants;

CREATE POLICY "menu_item_variants_select_policy" ON menu_item_variants FOR SELECT USING (
    TRUE
);

CREATE POLICY "menu_item_variants_modify_policy" ON menu_item_variants FOR ALL USING (
    is_owner() OR get_user_role() = 'BRANCH_ADMIN'
);

-- 7.8 Table: tables
DROP POLICY IF EXISTS "tables_select_policy" ON tables;
DROP POLICY IF EXISTS "tables_modify_policy" ON tables;

CREATE POLICY "tables_select_policy" ON tables FOR SELECT USING (
    is_staff_of_branch(branch_id)
);

CREATE POLICY "tables_modify_policy" ON tables FOR ALL USING (
    is_owner() OR (get_user_role() = 'BRANCH_ADMIN' AND is_staff_of_branch(branch_id))
);

-- 7.9 Table: orders
DROP POLICY IF EXISTS "orders_select_policy" ON orders;
DROP POLICY IF EXISTS "orders_update_policy" ON orders;
DROP POLICY IF EXISTS "orders_delete_policy" ON orders;

CREATE POLICY "orders_select_policy" ON orders FOR SELECT USING (
    customer_id = auth.uid() OR is_staff_of_branch(branch_id) OR (
        get_user_role() = 'RIDER' AND id IN (SELECT order_id FROM rider_assignments WHERE rider_id = auth.uid())
    )
);

CREATE POLICY "orders_update_policy" ON orders FOR UPDATE USING (
    (customer_id = auth.uid() AND status = 'PENDING') OR is_staff_of_branch(branch_id) OR (
        get_user_role() = 'RIDER' AND id IN (SELECT order_id FROM rider_assignments WHERE rider_id = auth.uid())
    )
);

CREATE POLICY "orders_delete_policy" ON orders FOR DELETE USING (
    is_owner()
);

-- 7.10 Table: order_items
DROP POLICY IF EXISTS "order_items_select_policy" ON order_items;
DROP POLICY IF EXISTS "order_items_modify_policy" ON order_items;

CREATE POLICY "order_items_select_policy" ON order_items FOR SELECT USING (
    order_id IN (
        SELECT id FROM orders WHERE customer_id = auth.uid() OR is_staff_of_branch(branch_id) OR id IN (
            SELECT order_id FROM rider_assignments WHERE rider_id = auth.uid()
        )
    )
);

CREATE POLICY "order_items_modify_policy" ON order_items FOR ALL USING (
    is_owner() OR is_staff_of_branch((SELECT branch_id FROM orders WHERE id = order_id))
);

-- 7.11 Table: order_status_history
DROP POLICY IF EXISTS "order_status_history_select_policy" ON order_status_history;

CREATE POLICY "order_status_history_select_policy" ON order_status_history FOR SELECT USING (
    order_id IN (
        SELECT id FROM orders WHERE customer_id = auth.uid() OR is_staff_of_branch(branch_id) OR id IN (
            SELECT order_id FROM rider_assignments WHERE rider_id = auth.uid()
        )
    )
);

-- 7.12 Table: rider_assignments
DROP POLICY IF EXISTS "rider_assignments_select_policy" ON rider_assignments;
DROP POLICY IF EXISTS "rider_assignments_update_policy" ON rider_assignments;

CREATE POLICY "rider_assignments_select_policy" ON rider_assignments FOR SELECT USING (
    rider_id = auth.uid() OR is_staff_of_branch((SELECT branch_id FROM orders WHERE id = order_id))
);

CREATE POLICY "rider_assignments_update_policy" ON rider_assignments FOR UPDATE USING (
    rider_id = auth.uid() OR is_owner()
);

-- 7.13 Table: buffet_registrations
DROP POLICY IF EXISTS "buffet_registrations_select_policy" ON buffet_registrations;
DROP POLICY IF EXISTS "buffet_registrations_modify_policy" ON buffet_registrations;

CREATE POLICY "buffet_registrations_select_policy" ON buffet_registrations FOR SELECT USING (
    is_active = TRUE OR auth.uid() IS NOT NULL
);

CREATE POLICY "buffet_registrations_modify_policy" ON buffet_registrations FOR ALL USING (
    is_owner() OR (get_user_role() = 'BRANCH_ADMIN' AND is_staff_of_branch(branch_id))
);

-- 7.14 Table: buffet_bookings
DROP POLICY IF EXISTS "buffet_bookings_select_policy" ON buffet_bookings;
DROP POLICY IF EXISTS "buffet_bookings_insert_policy" ON buffet_bookings;
DROP POLICY IF EXISTS "buffet_bookings_update_policy" ON buffet_bookings;

CREATE POLICY "buffet_bookings_select_policy" ON buffet_bookings FOR SELECT USING (
    customer_email = (SELECT email FROM profiles WHERE id = auth.uid()) OR 
    is_staff_of_branch((SELECT branch_id FROM buffet_registrations WHERE id = buffet_id))
);

CREATE POLICY "buffet_bookings_insert_policy" ON buffet_bookings FOR INSERT WITH CHECK (
    TRUE
);

CREATE POLICY "buffet_bookings_update_policy" ON buffet_bookings FOR UPDATE USING (
    is_staff_of_branch((SELECT branch_id FROM buffet_registrations WHERE id = buffet_id))
);

-- 7.15 Table: merchant_bank_config (OWNER ONLY DIRECT ACCESS)
DROP POLICY IF EXISTS "merchant_bank_config_owner_policy" ON merchant_bank_config;

CREATE POLICY "merchant_bank_config_owner_policy" ON merchant_bank_config FOR ALL USING (
    is_owner()
);

-- 7.16 Table: audit_logs (IMMUTABLE)
DROP POLICY IF EXISTS "audit_logs_select_policy" ON audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert_policy" ON audit_logs;

CREATE POLICY "audit_logs_select_policy" ON audit_logs FOR SELECT USING (
    is_owner()
);

CREATE POLICY "audit_logs_insert_policy" ON audit_logs FOR INSERT WITH CHECK (
    user_id = auth.uid()
);

-- 8. Explicit RPC Privilege Governance
REVOKE ALL ON FUNCTION get_user_role FROM PUBLIC;
REVOKE ALL ON FUNCTION is_owner FROM PUBLIC;
REVOKE ALL ON FUNCTION is_staff_of_branch FROM PUBLIC;
REVOKE ALL ON FUNCTION is_rider FROM PUBLIC;

GRANT EXECUTE ON FUNCTION validate_qr_token(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_public_merchant_payment_info() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_order_by_tracking_token(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION create_order_atomic(UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, JSONB) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION update_order_status_secure(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION claim_delivery_order(UUID, UUID) TO authenticated;
