-- OK Restaurant Platform Security Hardening & RLS Migration
-- Migration 002: Security Hardening, RPCs, and Row Level Security (RLS)
-- Idempotent & Safe for Existing Databases (No DROP CASCADE)

-- 1. Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Schema Enhancements & Indexes
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'tracking_token'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN tracking_token UUID DEFAULT gen_random_uuid();
    END IF;
END $$;

UPDATE public.orders SET tracking_token = gen_random_uuid() WHERE tracking_token IS NULL;

ALTER TABLE public.orders ALTER COLUMN tracking_token SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_tracking_token ON public.orders(tracking_token);

DO $$
BEGIN
    ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
    ALTER TABLE public.orders ADD CONSTRAINT orders_payment_method_check 
    CHECK (payment_method IN ('CASH', 'JAZZCASH', 'EASYPAISA', 'CARD', 'ONLINE', 'TEST_PAYMENT'));
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- 3. Security Definer Helper Functions (Schema Qualified & Preserved Signatures)
CREATE OR REPLACE FUNCTION get_user_role(p_user_id UUID DEFAULT auth.uid())
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT role FROM public.profiles WHERE id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION is_owner(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND role = 'OWNER');
$$;

CREATE OR REPLACE FUNCTION is_staff_of_branch(p_branch_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.branch_users WHERE user_id = p_user_id AND branch_id = p_branch_id
    ) OR EXISTS (
        SELECT 1 FROM public.profiles WHERE id = p_user_id AND role = 'OWNER'
    );
$$;

CREATE OR REPLACE FUNCTION is_rider(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = p_user_id AND (role = 'RIDER' OR role = 'OWNER')
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
    branch_slug TEXT,
    is_active BOOLEAN
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id AS table_id,
        t.table_number,
        b.id AS branch_id,
        b.name AS branch_name,
        b.slug AS branch_slug,
        (t.is_active AND b.is_active) AS is_active
    FROM public.tables t
    JOIN public.branches b ON t.branch_id = b.id
    WHERE t.qr_code_token = p_token AND t.is_active = TRUE AND b.is_active = TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION validate_qr_token(TEXT) TO anon, authenticated;

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
    easypaisa_account_name TEXT
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.bank_name,
        m.account_title,
        m.account_number,
        m.iban,
        m.jazzcash_till_number,
        m.jazzcash_account_name,
        m.easypaisa_till_number,
        m.easypaisa_account_name
    FROM public.merchant_bank_config m
    WHERE m.is_online_payment_active = TRUE
    LIMIT 1;
END;
$$;
GRANT EXECUTE ON FUNCTION get_public_merchant_payment_info() TO anon, authenticated;

-- RPC 5.3: Atomic Order Creation
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

    SELECT is_active INTO v_branch_active FROM public.branches WHERE id = p_branch_id;
    IF v_branch_active IS NULL OR NOT v_branch_active THEN
        RAISE EXCEPTION 'Selected branch is invalid or inactive.';
    END IF;

    SELECT dine_in_enabled, takeaway_enabled, delivery_enabled 
    INTO v_dine_in_enabled, v_takeaway_enabled, v_delivery_enabled
    FROM public.branch_capabilities WHERE branch_id = p_branch_id;

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
            SELECT 1 FROM public.tables WHERE id = p_table_id AND branch_id = p_branch_id AND is_active = TRUE
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
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.order_number = v_order_number);
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
        FROM public.menu_items m WHERE m.id = v_menu_item_id;

        IF v_item_name IS NULL THEN
            RAISE EXCEPTION 'Menu item % not found.', v_menu_item_id;
        END IF;
        IF NOT COALESCE(v_is_available, FALSE) THEN
            RAISE EXCEPTION 'Menu item "%" is currently unavailable.', v_item_name;
        END IF;

        IF v_variant_id IS NOT NULL THEN
            SELECT mv.name, mv.price INTO v_variant_name, v_unit_price
            FROM public.menu_item_variants mv
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

    INSERT INTO public.orders (
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

        SELECT m.name, m.base_price INTO v_item_name, v_unit_price FROM public.menu_items m WHERE m.id = v_menu_item_id;
        IF v_variant_id IS NOT NULL THEN
            SELECT mv.name, mv.price INTO v_variant_name, v_unit_price FROM public.menu_item_variants mv WHERE mv.id = v_variant_id AND mv.menu_item_id = v_menu_item_id;
        ELSE
            v_variant_name := NULL;
        END IF;

        v_item_subtotal := v_unit_price * v_quantity;

        INSERT INTO public.order_items (
            id, order_id, menu_item_id, variant_id, item_name, variant_name, unit_price, quantity, subtotal_price, special_instructions
        ) VALUES (
            gen_random_uuid(), v_order_id, v_menu_item_id, v_variant_id, v_item_name, v_variant_name, v_unit_price, v_quantity, v_item_subtotal, v_item->>'special_instructions'
        );
    END LOOP;

    INSERT INTO public.order_status_history (id, order_id, from_status, to_status, changed_by_user_id, notes)
    VALUES (gen_random_uuid(), v_order_id, NULL, 'PENDING', auth.uid(), 'Order placed successfully');

    RETURN QUERY SELECT v_order_id, v_order_number, v_tracking_token, v_total;
END;
$$;
GRANT EXECUTE ON FUNCTION create_order_atomic(UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, JSONB) TO anon, authenticated;

-- RPC 5.4: Secure Order Status Update
CREATE OR REPLACE FUNCTION update_order_status_secure(
    p_order_id UUID,
    p_new_status TEXT,
    p_notes TEXT DEFAULT NULL
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_order_branch_id UUID;
    v_current_status TEXT;
    v_user_role TEXT := get_user_role();
BEGIN
    SELECT branch_id, status INTO v_order_branch_id, v_current_status
    FROM public.orders WHERE id = p_order_id FOR UPDATE;

    IF v_order_branch_id IS NULL THEN
        RAISE EXCEPTION 'Order not found.';
    END IF;

    IF NOT (is_owner() OR is_staff_of_branch(v_order_branch_id) OR is_rider()) THEN
        RAISE EXCEPTION 'Access Denied: You do not have permission to update orders for this branch.';
    END IF;

    UPDATE public.orders SET status = p_new_status, updated_at = NOW() WHERE id = p_order_id;
    INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by_user_id, notes)
    VALUES (p_order_id, v_current_status, p_new_status, auth.uid(), p_notes);

    RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION update_order_status_secure(UUID, TEXT, TEXT) TO authenticated;

-- RPC 5.5: Concurrency-Safe Rider Order Claiming
CREATE OR REPLACE FUNCTION claim_delivery_order(
    p_order_id UUID,
    p_rider_id UUID
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_current_status TEXT;
BEGIN
    SELECT status INTO v_current_status FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF v_current_status != 'READY' THEN
        RETURN FALSE;
    END IF;

    BEGIN
        INSERT INTO public.rider_assignments (order_id, rider_id, status)
        VALUES (p_order_id, p_rider_id, 'ACCEPTED');
    EXCEPTION WHEN UNIQUE_VIOLATION THEN
        RETURN FALSE;
    END;

    UPDATE public.orders SET status = 'ASSIGNED', updated_at = NOW() WHERE id = p_order_id;
    INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by_user_id, notes)
    VALUES (p_order_id, 'READY', 'ASSIGNED', p_rider_id, 'Rider claimed delivery order');

    RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION claim_delivery_order(UUID, UUID) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS) POLICIES ON ALL TABLES
-- ----------------------------------------------------------------------------

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_item_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rider_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buffet_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buffet_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_bank_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 6.1 Table: profiles
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
CREATE POLICY "profiles_select_policy" ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;
CREATE POLICY "profiles_update_policy" ON public.profiles FOR UPDATE USING (id = auth.uid() OR is_owner());

DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;
CREATE POLICY "profiles_insert_policy" ON public.profiles FOR INSERT WITH CHECK (id = auth.uid() OR is_owner());

-- 6.2 Table: branches
DROP POLICY IF EXISTS "branches_select_policy" ON public.branches;
CREATE POLICY "branches_select_policy" ON public.branches FOR SELECT USING (true);

DROP POLICY IF EXISTS "branches_modify_policy" ON public.branches;
CREATE POLICY "branches_modify_policy" ON public.branches FOR ALL USING (is_owner());

-- 6.3 Table: branch_capabilities
DROP POLICY IF EXISTS "branch_capabilities_select_policy" ON public.branch_capabilities;
CREATE POLICY "branch_capabilities_select_policy" ON public.branch_capabilities FOR SELECT USING (true);

DROP POLICY IF EXISTS "branch_capabilities_update_policy" ON public.branch_capabilities;
CREATE POLICY "branch_capabilities_update_policy" ON public.branch_capabilities FOR UPDATE USING (is_owner() OR is_staff_of_branch(branch_id));

-- 6.4 Table: branch_users
DROP POLICY IF EXISTS "branch_users_select_policy" ON public.branch_users;
CREATE POLICY "branch_users_select_policy" ON public.branch_users FOR SELECT USING (user_id = auth.uid() OR is_owner() OR is_staff_of_branch(branch_id));

DROP POLICY IF EXISTS "branch_users_modify_policy" ON public.branch_users;
CREATE POLICY "branch_users_modify_policy" ON public.branch_users FOR ALL USING (is_owner());

-- 6.5 Table: menu_categories
DROP POLICY IF EXISTS "menu_categories_select_policy" ON public.menu_categories;
CREATE POLICY "menu_categories_select_policy" ON public.menu_categories FOR SELECT USING (true);

DROP POLICY IF EXISTS "menu_categories_modify_policy" ON public.menu_categories;
CREATE POLICY "menu_categories_modify_policy" ON public.menu_categories FOR ALL USING (is_owner());

-- 6.6 Table: menu_items
DROP POLICY IF EXISTS "menu_items_select_policy" ON public.menu_items;
CREATE POLICY "menu_items_select_policy" ON public.menu_items FOR SELECT USING (true);

DROP POLICY IF EXISTS "menu_items_modify_policy" ON public.menu_items;
CREATE POLICY "menu_items_modify_policy" ON public.menu_items FOR ALL USING (is_owner());

-- 6.7 Table: menu_item_variants
DROP POLICY IF EXISTS "menu_item_variants_select_policy" ON public.menu_item_variants;
CREATE POLICY "menu_item_variants_select_policy" ON public.menu_item_variants FOR SELECT USING (true);

DROP POLICY IF EXISTS "menu_item_variants_modify_policy" ON public.menu_item_variants;
CREATE POLICY "menu_item_variants_modify_policy" ON public.menu_item_variants FOR ALL USING (is_owner());

-- 6.8 Table: tables
DROP POLICY IF EXISTS "tables_select_policy" ON public.tables;
CREATE POLICY "tables_select_policy" ON public.tables FOR SELECT USING (true);

DROP POLICY IF EXISTS "tables_modify_policy" ON public.tables;
CREATE POLICY "tables_modify_policy" ON public.tables FOR ALL USING (is_owner() OR is_staff_of_branch(branch_id));

-- 6.9 Table: orders
DROP POLICY IF EXISTS "orders_select_policy" ON public.orders;
CREATE POLICY "orders_select_policy" ON public.orders FOR SELECT USING (
    customer_id = auth.uid() OR 
    is_owner() OR 
    is_staff_of_branch(branch_id) OR 
    is_rider() OR
    tracking_token IS NOT NULL
);

DROP POLICY IF EXISTS "orders_update_policy" ON public.orders;
CREATE POLICY "orders_update_policy" ON public.orders FOR UPDATE USING (
    is_owner() OR 
    is_staff_of_branch(branch_id) OR 
    is_rider()
);

-- 6.10 Table: order_items
DROP POLICY IF EXISTS "order_items_select_policy" ON public.order_items;
CREATE POLICY "order_items_select_policy" ON public.order_items FOR SELECT USING (true);

-- 6.11 Table: order_status_history
DROP POLICY IF EXISTS "order_status_history_select_policy" ON public.order_status_history;
CREATE POLICY "order_status_history_select_policy" ON public.order_status_history FOR SELECT USING (true);

-- 6.12 Table: rider_assignments
DROP POLICY IF EXISTS "rider_assignments_select_policy" ON public.rider_assignments;
CREATE POLICY "rider_assignments_select_policy" ON public.rider_assignments FOR SELECT USING (true);

DROP POLICY IF EXISTS "rider_assignments_insert_policy" ON public.rider_assignments;
CREATE POLICY "rider_assignments_insert_policy" ON public.rider_assignments FOR INSERT WITH CHECK (rider_id = auth.uid() OR is_owner());

-- 6.13 Table: buffet_registrations
DROP POLICY IF EXISTS "buffet_registrations_select_policy" ON public.buffet_registrations;
CREATE POLICY "buffet_registrations_select_policy" ON public.buffet_registrations FOR SELECT USING (true);

DROP POLICY IF EXISTS "buffet_registrations_modify_policy" ON public.buffet_registrations;
CREATE POLICY "buffet_registrations_modify_policy" ON public.buffet_registrations FOR ALL USING (is_owner() OR is_staff_of_branch(branch_id));

-- 6.14 Table: buffet_bookings
DROP POLICY IF EXISTS "buffet_bookings_select_policy" ON public.buffet_bookings;
CREATE POLICY "buffet_bookings_select_policy" ON public.buffet_bookings FOR SELECT USING (true);

DROP POLICY IF EXISTS "buffet_bookings_insert_policy" ON public.buffet_bookings;
CREATE POLICY "buffet_bookings_insert_policy" ON public.buffet_bookings FOR INSERT WITH CHECK (true);

-- 6.15 Table: merchant_bank_config
DROP POLICY IF EXISTS "merchant_bank_config_owner_policy" ON public.merchant_bank_config;
CREATE POLICY "merchant_bank_config_owner_policy" ON public.merchant_bank_config FOR ALL USING (is_owner());
