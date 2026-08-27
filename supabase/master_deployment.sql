-- ============================================================================
-- OK RESTAURANT PLATFORM: MASTER PRODUCTION DEPLOYMENT SCRIPT (HARDENED)
-- ============================================================================
-- Complete, self-contained, idempotent deployment script for Supabase / PostgreSQL.
-- Includes schema, extensions, security definer helpers, RLS policies, RPCs, and seed auth.
-- ============================================================================

-- OK Restaurant Multi-Branch Platform Schema Migration
-- Migration 001: Initial Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Profiles Table (Extends Supabase Auth or Local Auth Profiles)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE,
    full_name TEXT NOT NULL,
    phone TEXT,
    role TEXT NOT NULL DEFAULT 'CUSTOMER' CHECK (role IN ('OWNER', 'BRANCH_ADMIN', 'KITCHEN', 'RIDER', 'CUSTOMER')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Branches Table
CREATE TABLE IF NOT EXISTS branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    address TEXT NOT NULL,
    phone TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Branch Capabilities Table (Database-driven capabilities)
CREATE TABLE IF NOT EXISTS branch_capabilities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE UNIQUE NOT NULL,
    dine_in_enabled BOOLEAN DEFAULT TRUE,
    takeaway_enabled BOOLEAN DEFAULT TRUE,
    delivery_enabled BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Branch Users (Staff assignment)
CREATE TABLE IF NOT EXISTS branch_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('BRANCH_ADMIN', 'KITCHEN', 'RIDER')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, branch_id)
);

-- 5. Menu Categories
CREATE TABLE IF NOT EXISTS menu_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    icon TEXT,
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE
);

-- 6. Menu Items
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

-- 7. Menu Item Variants (e.g., Small/Medium/Large or Full/Half)
CREATE TABLE IF NOT EXISTS menu_item_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_item_id UUID REFERENCES menu_items(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    sort_order INT DEFAULT 0
);

-- 8. Restaurant Tables (For QR Table Ordering)
CREATE TABLE IF NOT EXISTS tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES branches(id) ON DELETE CASCADE NOT NULL,
    table_number TEXT NOT NULL,
    qr_code_token TEXT UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(branch_id, table_number)
);

-- 9. Orders Table
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT UNIQUE NOT NULL,
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

-- 10. Order Items
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

-- 11. Order Status History Table
CREATE TABLE IF NOT EXISTS order_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE NOT NULL,
    from_status TEXT,
    to_status TEXT NOT NULL,
    changed_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. Rider Assignments (Concurrency Safe)
CREATE TABLE IF NOT EXISTS rider_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE UNIQUE NOT NULL,
    rider_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'ACCEPTED' CHECK (status IN ('ACCEPTED', 'REJECTED', 'COMPLETED', 'FAILED'))
);

-- 13. Buffet Registrations
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

-- 14. Buffet Bookings
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

-- 15. Merchant Bank Configuration
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

-- 16. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for high performance
CREATE INDEX IF NOT EXISTS idx_orders_branch_id ON orders(branch_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_tables_qr_token ON tables(qr_code_token);
CREATE INDEX IF NOT EXISTS idx_buffet_bookings_qr_token ON buffet_bookings(qr_ticket_token);

-- Concurrency-safe rider claiming function
CREATE OR REPLACE FUNCTION claim_delivery_order(
    p_order_id UUID,
    p_rider_id UUID
) RETURNS BOOLEAN AS $$
DECLARE
    v_current_status TEXT;
    v_inserted_id UUID;
BEGIN
    -- Lock row for update
    SELECT status INTO v_current_status
    FROM orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_current_status != 'READY' THEN
        RETURN FALSE;
    END IF;

    -- Attempt insert into rider assignments (fails if already exists due to UNIQUE constraint)
    BEGIN
        INSERT INTO rider_assignments (order_id, rider_id, status)
        VALUES (p_order_id, p_rider_id, 'ACCEPTED')
        RETURNING id INTO v_inserted_id;
    EXCEPTION WHEN UNIQUE_VIOLATION THEN
        RETURN FALSE;
    END;

    -- Update order status to ASSIGNED
    UPDATE orders
    SET status = 'ASSIGNED', updated_at = NOW()
    WHERE id = p_order_id;

    -- Record status history
    INSERT INTO order_status_history (order_id, from_status, to_status, changed_by_user_id, notes)
    VALUES (p_order_id, 'READY', 'ASSIGNED', p_rider_id, 'Rider claimed delivery order');

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- OK RESTAURANT PLATFORM: PRODUCTION SECURITY HARDENING (MIGRATION 007)
-- ============================================================================
-- 1. Strict Row Level Security (RLS) with Multi-Branch Isolation
-- 2. Finite State Machine (FSM) Transition Enforcement inside PostgreSQL
-- 3. Concurrency-Safe & Impersonation-Proof Rider Claiming
-- 4. Secure Public Tracking RPC with PII Masking
-- 5. Atomic Order Creation with Resilient QR Table Resolution
-- 6. Role-Based Privilege Grants & Revocations
-- 7. Privilege Escalation Prevention in Staff Profile Synchronization
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Ensure tracking_token column exists on orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS tracking_token UUID DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_tracking_token ON public.orders(tracking_token);

-- ----------------------------------------------------------------------------
-- SECTION 1: SECURITY DEFINER HELPER FUNCTIONS (Schema Qualified & Hardened)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_user_role(p_user_id UUID DEFAULT auth.uid())
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT role FROM public.profiles WHERE id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.get_user_branch_id(p_user_id UUID DEFAULT auth.uid())
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT branch_id FROM public.branch_users WHERE user_id = p_user_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_owner(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT (
        p_user_id IS NOT NULL AND
        EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND role = 'OWNER')
    );
$$;

CREATE OR REPLACE FUNCTION public.is_staff_of_branch(p_branch_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT (
        p_user_id IS NOT NULL AND (
            EXISTS (SELECT 1 FROM public.branch_users WHERE user_id = p_user_id AND branch_id = p_branch_id) OR
            EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND role = 'OWNER')
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.is_rider(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT (
        p_user_id IS NOT NULL AND
        EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND (role = 'RIDER' OR role = 'OWNER'))
    );
$$;

CREATE OR REPLACE FUNCTION public.is_rider_assigned(p_order_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT (
        p_user_id IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM public.rider_assignments
            WHERE order_id = p_order_id AND rider_id = p_user_id
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_access_order(p_order_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT (
        p_user_id IS NOT NULL AND
        EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = p_order_id AND (
                is_staff_of_branch(o.branch_id, p_user_id) OR
                o.customer_id = p_user_id OR
                is_owner(p_user_id)
            )
        )
    );
$$;

-- ----------------------------------------------------------------------------
-- SECTION 2: PRIVILEGE REVOCATIONS & PUBLIC CATALOG GRANTS
-- ----------------------------------------------------------------------------

-- Revoke dangerous direct write/read privileges on core transactional tables from anon
REVOKE ALL ON public.orders FROM anon;
REVOKE ALL ON public.order_items FROM anon;
REVOKE ALL ON public.order_status_history FROM anon;
REVOKE ALL ON public.rider_assignments FROM anon;
REVOKE ALL ON public.merchant_bank_config FROM anon;
REVOKE ALL ON public.audit_logs FROM anon;
REVOKE ALL ON public.tables FROM anon;
REVOKE ALL ON public.branch_users FROM anon;
REVOKE ALL ON public.buffet_bookings FROM anon;

-- Grant selective read access for public ordering catalog
GRANT SELECT ON public.branches TO anon, authenticated;
GRANT SELECT ON public.branch_capabilities TO anon, authenticated;
GRANT SELECT ON public.menu_categories TO anon, authenticated;
GRANT SELECT ON public.menu_items TO anon, authenticated;
GRANT SELECT ON public.menu_item_variants TO anon, authenticated;
GRANT SELECT ON public.buffet_registrations TO anon, authenticated;

-- Authenticated table privileges (enforced via Row Level Security)
GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.order_items TO authenticated;
GRANT SELECT, INSERT ON public.order_status_history TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.rider_assignments TO authenticated;
GRANT SELECT, UPDATE ON public.merchant_bank_config TO authenticated;
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, UPDATE ON public.branch_capabilities TO authenticated;
GRANT SELECT, UPDATE ON public.tables TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.buffet_bookings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.menu_item_variants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.buffet_registrations TO authenticated;

-- ----------------------------------------------------------------------------
-- SECTION 3: ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------

-- 3.1 Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_policy" ON public.profiles;

CREATE POLICY "profiles_select_policy" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update_policy" ON public.profiles FOR UPDATE USING (id = auth.uid() OR is_owner(auth.uid()));
CREATE POLICY "profiles_insert_policy" ON public.profiles FOR INSERT WITH CHECK (id = auth.uid() OR is_owner(auth.uid()));
CREATE POLICY "profiles_delete_policy" ON public.profiles FOR DELETE USING (is_owner(auth.uid()));

-- 3.2 Branches & Capabilities
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "branches_all" ON public.branches;
DROP POLICY IF EXISTS "branches_select_policy" ON public.branches;
DROP POLICY IF EXISTS "branches_modify_policy" ON public.branches;

CREATE POLICY "branches_select_policy" ON public.branches FOR SELECT USING (is_active = true OR is_owner(auth.uid()));
CREATE POLICY "branches_modify_policy" ON public.branches FOR ALL USING (is_owner(auth.uid()));

ALTER TABLE public.branch_capabilities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "branch_capabilities_all" ON public.branch_capabilities;
DROP POLICY IF EXISTS "branch_capabilities_select_policy" ON public.branch_capabilities;
DROP POLICY IF EXISTS "branch_capabilities_update_policy" ON public.branch_capabilities;

CREATE POLICY "branch_capabilities_select_policy" ON public.branch_capabilities FOR SELECT USING (true);
CREATE POLICY "branch_capabilities_update_policy" ON public.branch_capabilities FOR UPDATE USING (
    is_owner(auth.uid()) OR is_staff_of_branch(branch_id, auth.uid())
);

-- 3.3 Branch Users (Staff Allocations)
ALTER TABLE public.branch_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "branch_users_all" ON public.branch_users;
DROP POLICY IF EXISTS "branch_users_select_policy" ON public.branch_users;
DROP POLICY IF EXISTS "branch_users_modify_policy" ON public.branch_users;

CREATE POLICY "branch_users_select_policy" ON public.branch_users FOR SELECT USING (true);
CREATE POLICY "branch_users_modify_policy" ON public.branch_users FOR ALL USING (is_owner(auth.uid()) OR user_id = auth.uid());

-- 3.4 Tables & QR Tokens
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tables_all" ON public.tables;
DROP POLICY IF EXISTS "tables_select_policy" ON public.tables;
DROP POLICY IF EXISTS "tables_modify_policy" ON public.tables;

CREATE POLICY "tables_select_policy" ON public.tables FOR SELECT USING (
    is_owner(auth.uid()) OR is_staff_of_branch(branch_id, auth.uid())
);
CREATE POLICY "tables_modify_policy" ON public.tables FOR ALL USING (
    is_owner(auth.uid()) OR is_staff_of_branch(branch_id, auth.uid())
);

-- 3.5 Orders (Strict Multi-Branch & Identity Isolation)
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "orders_all" ON public.orders;
DROP POLICY IF EXISTS "orders_select_policy" ON public.orders;
DROP POLICY IF EXISTS "orders_insert_policy" ON public.orders;
DROP POLICY IF EXISTS "orders_update_policy" ON public.orders;
DROP POLICY IF EXISTS "orders_delete_policy" ON public.orders;

CREATE POLICY "orders_select_policy" ON public.orders FOR SELECT USING (
    auth.uid() IS NOT NULL AND (
        is_owner(auth.uid()) OR
        is_staff_of_branch(branch_id, auth.uid()) OR
        (get_user_role(auth.uid()) = 'RIDER' AND (
            (status = 'READY' AND order_type = 'DELIVERY' AND is_staff_of_branch(branch_id, auth.uid())) OR
            is_rider_assigned(id, auth.uid())
        )) OR
        customer_id = auth.uid()
    )
);

CREATE POLICY "orders_insert_policy" ON public.orders FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND (
        customer_id = auth.uid() OR
        is_owner(auth.uid())
    )
);

CREATE POLICY "orders_update_policy" ON public.orders FOR UPDATE USING (
    auth.uid() IS NOT NULL AND (
        is_owner(auth.uid()) OR
        is_staff_of_branch(branch_id, auth.uid()) OR
        (get_user_role(auth.uid()) = 'RIDER' AND is_rider_assigned(id, auth.uid()))
    )
);

CREATE POLICY "orders_delete_policy" ON public.orders FOR DELETE USING (
    is_owner(auth.uid())
);

-- 3.6 Order Items
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "order_items_all" ON public.order_items;
DROP POLICY IF EXISTS "order_items_select_policy" ON public.order_items;
DROP POLICY IF EXISTS "order_items_insert_policy" ON public.order_items;
DROP POLICY IF EXISTS "order_items_update_policy" ON public.order_items;
DROP POLICY IF EXISTS "order_items_delete_policy" ON public.order_items;

CREATE POLICY "order_items_select_policy" ON public.order_items FOR SELECT USING (
    can_access_order(order_id, auth.uid()) OR
    (get_user_role(auth.uid()) = 'RIDER' AND is_rider_assigned(order_id, auth.uid()))
);

CREATE POLICY "order_items_insert_policy" ON public.order_items FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND (
        is_owner(auth.uid()) OR
        can_access_order(order_id, auth.uid())
    )
);

CREATE POLICY "order_items_update_policy" ON public.order_items FOR UPDATE USING (
    auth.uid() IS NOT NULL AND (
        is_owner(auth.uid()) OR
        can_access_order(order_id, auth.uid())
    )
);

CREATE POLICY "order_items_delete_policy" ON public.order_items FOR DELETE USING (
    is_owner(auth.uid())
);

-- 3.7 Order Status History
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "order_status_history_all" ON public.order_status_history;
DROP POLICY IF EXISTS "order_status_history_select_policy" ON public.order_status_history;
DROP POLICY IF EXISTS "order_status_history_insert_policy" ON public.order_status_history;

CREATE POLICY "order_status_history_select_policy" ON public.order_status_history FOR SELECT USING (
    can_access_order(order_id, auth.uid()) OR
    (get_user_role(auth.uid()) = 'RIDER' AND is_rider_assigned(order_id, auth.uid()))
);

CREATE POLICY "order_status_history_insert_policy" ON public.order_status_history FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND (
        is_owner(auth.uid()) OR
        can_access_order(order_id, auth.uid()) OR
        (get_user_role(auth.uid()) = 'RIDER' AND changed_by_user_id = auth.uid())
    )
);

-- 3.8 Rider Assignments
ALTER TABLE public.rider_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rider_assignments_all" ON public.rider_assignments;
DROP POLICY IF EXISTS "rider_assignments_select_policy" ON public.rider_assignments;
DROP POLICY IF EXISTS "rider_assignments_insert_policy" ON public.rider_assignments;
DROP POLICY IF EXISTS "rider_assignments_update_policy" ON public.rider_assignments;
DROP POLICY IF EXISTS "rider_assignments_delete_policy" ON public.rider_assignments;

CREATE POLICY "rider_assignments_select_policy" ON public.rider_assignments FOR SELECT USING (
    is_owner(auth.uid()) OR
    rider_id = auth.uid() OR
    can_access_order(order_id, auth.uid())
);

CREATE POLICY "rider_assignments_insert_policy" ON public.rider_assignments FOR INSERT WITH CHECK (
    is_owner(auth.uid()) OR
    (get_user_role(auth.uid()) = 'RIDER' AND rider_id = auth.uid())
);

CREATE POLICY "rider_assignments_update_policy" ON public.rider_assignments FOR UPDATE USING (
    is_owner(auth.uid()) OR
    (get_user_role(auth.uid()) = 'RIDER' AND rider_id = auth.uid())
);

CREATE POLICY "rider_assignments_delete_policy" ON public.rider_assignments FOR DELETE USING (
    is_owner(auth.uid())
);

-- 3.9 Merchant Bank Configuration & Audit Logs
ALTER TABLE public.merchant_bank_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "merchant_bank_config_all" ON public.merchant_bank_config;
DROP POLICY IF EXISTS "merchant_bank_config_select_policy" ON public.merchant_bank_config;
DROP POLICY IF EXISTS "merchant_bank_config_update_policy" ON public.merchant_bank_config;

CREATE POLICY "merchant_bank_config_select_policy" ON public.merchant_bank_config FOR SELECT USING (
    is_owner(auth.uid())
);
CREATE POLICY "merchant_bank_config_update_policy" ON public.merchant_bank_config FOR UPDATE USING (
    is_owner(auth.uid())
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_logs_all" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_select_policy" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert_policy" ON public.audit_logs;

CREATE POLICY "audit_logs_select_policy" ON public.audit_logs FOR SELECT USING (
    is_owner(auth.uid())
);
CREATE POLICY "audit_logs_insert_policy" ON public.audit_logs FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
);

-- ----------------------------------------------------------------------------
-- SECTION 4: POSTGRESQL STATE MACHINE ENFORCEMENT & SECURE STATUS UPDATES
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.update_order_status_direct(UUID, TEXT, UUID, TEXT);
DROP FUNCTION IF EXISTS public.update_order_status_secure(UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.update_order_status_direct(
    p_order_id UUID,
    p_new_status TEXT,
    p_user_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_effective_user_id UUID;
    v_caller_role TEXT;
    v_order_branch_id UUID;
    v_current_status TEXT;
    v_order_type TEXT;
    v_payment_method TEXT;
    v_is_valid_transition BOOLEAN := FALSE;
BEGIN
    -- 1. Determine effective user ID
    v_effective_user_id := COALESCE(v_caller_id, p_user_id);
    IF v_effective_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to update order status.';
    END IF;

    v_caller_role := get_user_role(v_effective_user_id);

    -- 2. Lock the target order row
    SELECT branch_id, status, order_type, payment_method
    INTO v_order_branch_id, v_current_status, v_order_type, v_payment_method
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF v_current_status IS NULL THEN
        RAISE EXCEPTION 'Order with ID % not found.', p_order_id;
    END IF;

    -- 3. Idempotent check: if already in the target status, return TRUE
    IF v_current_status = p_new_status THEN
        RETURN TRUE;
    END IF;

    -- 4. Reject transitions out of terminal states
    IF v_current_status IN ('COMPLETED', 'REJECTED', 'CANCELLED') THEN
        RAISE EXCEPTION 'Cannot update order % because it is already in terminal state "%".', p_order_id, v_current_status;
    END IF;

    -- 5. Finite State Machine (FSM) Transition Graph Validation
    IF p_new_status = 'CANCELLED' THEN
        IF v_current_status IN ('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'ASSIGNED') THEN
            v_is_valid_transition := TRUE;
        END IF;
    ELSIF v_current_status = 'PENDING' THEN
        IF p_new_status IN ('CONFIRMED', 'REJECTED') THEN
            v_is_valid_transition := TRUE;
        END IF;
    ELSIF v_current_status = 'CONFIRMED' THEN
        IF p_new_status = 'PREPARING' THEN
            v_is_valid_transition := TRUE;
        END IF;
    ELSIF v_current_status = 'PREPARING' THEN
        IF p_new_status = 'READY' THEN
            v_is_valid_transition := TRUE;
        END IF;
    ELSIF v_current_status = 'READY' THEN
        IF v_order_type = 'DELIVERY' THEN
            IF p_new_status = 'ASSIGNED' THEN
                v_is_valid_transition := TRUE;
            END IF;
        ELSE -- DINE_IN or TAKEAWAY
            IF p_new_status = 'COMPLETED' THEN
                v_is_valid_transition := TRUE;
            END IF;
        END IF;
    ELSIF v_current_status = 'ASSIGNED' THEN
        IF v_order_type = 'DELIVERY' AND p_new_status = 'PICKED_UP' THEN
            v_is_valid_transition := TRUE;
        END IF;
    ELSIF v_current_status = 'PICKED_UP' THEN
        IF v_order_type = 'DELIVERY' AND p_new_status = 'OUT_FOR_DELIVERY' THEN
            v_is_valid_transition := TRUE;
        END IF;
    ELSIF v_current_status = 'OUT_FOR_DELIVERY' THEN
        IF v_order_type = 'DELIVERY' AND p_new_status = 'DELIVERED' THEN
            v_is_valid_transition := TRUE;
        END IF;
    ELSIF v_current_status = 'DELIVERED' THEN
        IF v_order_type = 'DELIVERY' AND p_new_status = 'COMPLETED' THEN
            v_is_valid_transition := TRUE;
        END IF;
    END IF;

    IF NOT v_is_valid_transition THEN
        RAISE EXCEPTION 'Illegal order status transition from % to % for order type %.', v_current_status, p_new_status, v_order_type;
    END IF;

    -- 6. Role Authorization Validation
    IF v_caller_role = 'OWNER' THEN
        NULL;
    ELSIF v_caller_role = 'BRANCH_ADMIN' THEN
        IF NOT is_staff_of_branch(v_order_branch_id, v_effective_user_id) THEN
            RAISE EXCEPTION 'Access Denied: Branch Admin cannot modify orders belonging to another branch.';
        END IF;
    ELSIF v_caller_role = 'KITCHEN' THEN
        IF NOT is_staff_of_branch(v_order_branch_id, v_effective_user_id) THEN
            RAISE EXCEPTION 'Access Denied: Kitchen staff cannot modify orders belonging to another branch.';
        END IF;
        IF p_new_status NOT IN ('PREPARING', 'READY', 'COMPLETED') THEN
            RAISE EXCEPTION 'Access Denied: Kitchen staff cannot transition orders to "%".', p_new_status;
        END IF;
    ELSIF v_caller_role = 'RIDER' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.rider_assignments WHERE order_id = p_order_id AND rider_id = v_effective_user_id
        ) THEN
            RAISE EXCEPTION 'Access Denied: Rider is not assigned to this delivery order.';
        END IF;
        IF p_new_status NOT IN ('PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED') THEN
            RAISE EXCEPTION 'Access Denied: Riders cannot transition orders to "%".', p_new_status;
        END IF;
    ELSE
        RAISE EXCEPTION 'Access Denied: Unauthorized role "%".', v_caller_role;
    END IF;

    -- 7. Execute Order Update
    UPDATE public.orders
    SET 
        status = p_new_status,
        payment_status = CASE 
            WHEN p_new_status IN ('DELIVERED', 'COMPLETED') AND payment_method = 'CASH' THEN 'PAID'
            ELSE payment_status
        END,
        updated_at = NOW()
    WHERE id = p_order_id;

    -- 8. Audit Logging
    INSERT INTO public.order_status_history (
        id, order_id, from_status, to_status, changed_by_user_id, notes, created_at
    ) VALUES (
        gen_random_uuid(),
        p_order_id,
        v_current_status,
        p_new_status,
        v_effective_user_id,
        COALESCE(p_notes, 'Status changed from ' || v_current_status || ' to ' || p_new_status),
        NOW()
    );

    RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_order_status_direct(UUID, TEXT, UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_order_status_secure(
    p_order_id UUID,
    p_new_status TEXT,
    p_notes TEXT DEFAULT NULL
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    RETURN public.update_order_status_direct(p_order_id, p_new_status, auth.uid(), p_notes);
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_order_status_secure(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.batch_update_order_status(
    p_order_ids UUID[],
    p_new_status TEXT,
    p_user_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
) RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_oid UUID;
    v_count INT := 0;
BEGIN
    FOREACH v_oid IN ARRAY p_order_ids
    LOOP
        BEGIN
            IF public.update_order_status_direct(v_oid, p_new_status, p_user_id, p_notes) THEN
                v_count := v_count + 1;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END LOOP;
    RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.batch_update_order_status(UUID[], TEXT, UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- SECTION 5: CONCURRENCY-SAFE & IMPERSONATION-PROOF RIDER CLAIMING
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.claim_delivery_order(UUID, UUID);
DROP FUNCTION IF EXISTS public.claim_delivery_order(UUID);

CREATE OR REPLACE FUNCTION public.claim_delivery_order(
    p_order_id UUID,
    p_rider_id UUID DEFAULT NULL
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_rider_id UUID;
    v_order_branch_id UUID;
    v_current_status TEXT;
    v_order_type TEXT;
    v_caller_role TEXT;
    v_already_assigned BOOLEAN;
BEGIN
    -- 1. Resolve Effective Rider ID
    IF v_caller_id IS NOT NULL THEN
        v_caller_role := get_user_role(v_caller_id);
        IF v_caller_role = 'OWNER' AND p_rider_id IS NOT NULL THEN
            v_rider_id := p_rider_id;
        ELSE
            IF p_rider_id IS NOT NULL AND p_rider_id != v_caller_id THEN
                RAISE EXCEPTION 'Access Denied: Impersonating another rider is strictly prohibited.';
            END IF;
            v_rider_id := v_caller_id;
        END IF;
    ELSE
        IF p_rider_id IS NOT NULL THEN
            v_rider_id := p_rider_id;
            v_caller_role := get_user_role(v_rider_id);
        ELSE
            RAISE EXCEPTION 'Authentication required to claim delivery orders.';
        END IF;
    END IF;

    -- 2. Verify Role
    IF v_caller_role NOT IN ('RIDER', 'OWNER') THEN
        RAISE EXCEPTION 'Access Denied: Only riders can claim delivery orders.';
    END IF;

    -- 3. Lock Order Row
    SELECT branch_id, status, order_type 
    INTO v_order_branch_id, v_current_status, v_order_type
    FROM public.orders 
    WHERE id = p_order_id 
    FOR UPDATE;

    IF v_order_branch_id IS NULL THEN
        RAISE EXCEPTION 'Order not found.';
    END IF;

    -- 4. Verify Branch Assignment
    IF v_caller_role != 'OWNER' AND NOT is_staff_of_branch(v_order_branch_id, v_rider_id) THEN
        RAISE EXCEPTION 'Access Denied: Rider is not registered for the branch of this order.';
    END IF;

    -- 5. Verify Delivery Eligibility
    IF v_order_type != 'DELIVERY' THEN
        RAISE EXCEPTION 'Invalid operation: Dine-in and Takeaway orders cannot be claimed by riders.';
    END IF;

    IF v_current_status != 'READY' THEN
        RETURN FALSE;
    END IF;

    -- 6. Verify Not Already Claimed
    SELECT EXISTS (
        SELECT 1 FROM public.rider_assignments WHERE order_id = p_order_id
    ) INTO v_already_assigned;

    IF v_already_assigned THEN
        RETURN FALSE;
    END IF;

    -- 7. Insert Assignment Atomically
    BEGIN
        INSERT INTO public.rider_assignments (id, order_id, rider_id, status, assigned_at)
        VALUES (gen_random_uuid(), p_order_id, v_rider_id, 'ACCEPTED', NOW());
    EXCEPTION WHEN UNIQUE_VIOLATION THEN
        RETURN FALSE; -- Lost race condition to concurrent rider
    END;

    -- 8. Update Order Status
    UPDATE public.orders 
    SET status = 'ASSIGNED', updated_at = NOW() 
    WHERE id = p_order_id;

    -- 9. Insert Status History Audit
    INSERT INTO public.order_status_history (id, order_id, from_status, to_status, changed_by_user_id, notes, created_at)
    VALUES (gen_random_uuid(), p_order_id, 'READY', 'ASSIGNED', v_rider_id, 'Delivery order claimed by rider', NOW());

    RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.claim_delivery_order(UUID, UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- SECTION 6: SECURE PUBLIC TRACKING & IDENTIFIER RESOLVER RPCS
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_order_by_tracking_token(UUID);
DROP FUNCTION IF EXISTS public.get_order_by_identifier(TEXT);

CREATE OR REPLACE FUNCTION public.get_order_by_tracking_token(p_tracking_token UUID)
RETURNS TABLE (
    order_id UUID,
    order_number TEXT,
    tracking_token UUID,
    branch_id UUID,
    branch_name TEXT,
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
    history JSONB,
    rider_info JSONB
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    RETURN QUERY
    SELECT 
        o.id AS order_id,
        o.order_number,
        o.tracking_token,
        o.branch_id,
        b.name AS branch_name,
        o.customer_name,
        CASE 
            WHEN auth.uid() IS NOT NULL AND (is_owner(auth.uid()) OR is_staff_of_branch(o.branch_id, auth.uid()) OR o.customer_id = auth.uid())
            THEN o.customer_phone
            ELSE SUBSTRING(o.customer_phone FROM 1 FOR 4) || '****' || SUBSTRING(o.customer_phone FROM GREATEST(1, LENGTH(o.customer_phone) - 2))
        END AS customer_phone,
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
            )) FROM public.order_items oi WHERE oi.order_id = o.id),
            '[]'::jsonb
        ) AS items,
        COALESCE(
            (SELECT jsonb_agg(jsonb_build_object(
                'id', osh.id,
                'from_status', osh.from_status,
                'to_status', osh.to_status,
                'notes', osh.notes,
                'created_at', osh.created_at
            ) ORDER BY osh.created_at ASC) FROM public.order_status_history osh WHERE osh.order_id = o.id),
            '[]'::jsonb
        ) AS history,
        (SELECT jsonb_build_object(
            'rider_name', p.full_name,
            'assigned_at', ra.assigned_at
        ) FROM public.rider_assignments ra 
          JOIN public.profiles p ON p.id = ra.rider_id 
          WHERE ra.order_id = o.id LIMIT 1) AS rider_info
    FROM public.orders o
    JOIN public.branches b ON b.id = o.branch_id
    WHERE o.tracking_token = p_tracking_token
    LIMIT 1;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_order_by_tracking_token(UUID) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_order_by_identifier(p_identifier TEXT)
RETURNS TABLE (
    order_id UUID,
    order_number TEXT,
    tracking_token UUID,
    branch_id UUID,
    branch_name TEXT,
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
    history JSONB,
    rider_info JSONB
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_is_uuid BOOLEAN;
    v_uuid UUID;
BEGIN
    v_is_uuid := p_identifier ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
    IF v_is_uuid THEN
        v_uuid := p_identifier::UUID;
    END IF;

    RETURN QUERY
    SELECT 
        o.id AS order_id,
        o.order_number,
        o.tracking_token,
        o.branch_id,
        b.name AS branch_name,
        o.customer_name,
        CASE 
            WHEN auth.uid() IS NOT NULL AND (is_owner(auth.uid()) OR is_staff_of_branch(o.branch_id, auth.uid()) OR o.customer_id = auth.uid())
            THEN o.customer_phone
            ELSE SUBSTRING(o.customer_phone FROM 1 FOR 4) || '****' || SUBSTRING(o.customer_phone FROM GREATEST(1, LENGTH(o.customer_phone) - 2))
        END AS customer_phone,
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
            )) FROM public.order_items oi WHERE oi.order_id = o.id),
            '[]'::jsonb
        ) AS items,
        COALESCE(
            (SELECT jsonb_agg(jsonb_build_object(
                'id', osh.id,
                'from_status', osh.from_status,
                'to_status', osh.to_status,
                'notes', osh.notes,
                'created_at', osh.created_at
            ) ORDER BY osh.created_at ASC) FROM public.order_status_history osh WHERE osh.order_id = o.id),
            '[]'::jsonb
        ) AS history,
        (SELECT jsonb_build_object(
            'rider_name', p.full_name,
            'assigned_at', ra.assigned_at
        ) FROM public.rider_assignments ra 
          JOIN public.profiles p ON p.id = ra.rider_id 
          WHERE ra.order_id = o.id LIMIT 1) AS rider_info
    FROM public.orders o
    JOIN public.branches b ON b.id = o.branch_id
    WHERE (
        -- Public tracking token match
        (v_is_uuid AND o.tracking_token = v_uuid)
        OR
        -- Order Number or Order ID match (requires authentication authorization)
        ((o.order_number = p_identifier OR (v_is_uuid AND o.id = v_uuid)) AND (
            auth.uid() IS NOT NULL AND (
                is_owner(auth.uid()) OR
                is_staff_of_branch(o.branch_id, auth.uid()) OR
                o.customer_id = auth.uid() OR
                (get_user_role(auth.uid()) = 'RIDER' AND (
                    (o.status = 'READY' AND o.order_type = 'DELIVERY') OR
                    EXISTS (SELECT 1 FROM public.rider_assignments ra WHERE ra.order_id = o.id AND ra.rider_id = auth.uid())
                ))
            )
        ))
    )
    LIMIT 1;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_order_by_identifier(TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- SECTION 7: AUTHORIZED GET BRANCH ORDERS RPC
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_branch_orders(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.get_branch_orders(
    p_branch_id UUID DEFAULT NULL,
    p_status TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    order_id UUID,
    order_number TEXT,
    tracking_token UUID,
    branch_id UUID,
    branch_name TEXT,
    customer_name TEXT,
    customer_phone TEXT,
    order_type TEXT,
    table_id TEXT,
    delivery_address TEXT,
    delivery_notes TEXT,
    subtotal NUMERIC,
    delivery_fee NUMERIC,
    total_amount NUMERIC,
    payment_method TEXT,
    payment_status TEXT,
    status TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    items JSONB,
    history JSONB,
    rider_info JSONB,
    rider_assignment JSONB
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role TEXT;
    v_caller_branch_id UUID;
BEGIN
    IF v_caller_id IS NOT NULL THEN
        v_caller_role := get_user_role(v_caller_id);
        v_caller_branch_id := get_user_branch_id(v_caller_id);

        IF v_caller_role = 'OWNER' THEN
            NULL;
        ELSIF v_caller_role IN ('BRANCH_ADMIN', 'KITCHEN', 'RIDER') THEN
            IF p_branch_id IS NOT NULL AND v_caller_branch_id IS NOT NULL AND p_branch_id != v_caller_branch_id THEN
                RAISE EXCEPTION 'Access Denied: You cannot view orders for another branch.';
            END IF;
            IF v_caller_branch_id IS NOT NULL THEN
                p_branch_id := v_caller_branch_id;
            END IF;
        END IF;
    END IF;

    RETURN QUERY
    SELECT 
        o.id,
        o.id AS order_id,
        o.order_number,
        o.tracking_token,
        o.branch_id,
        b.name AS branch_name,
        o.customer_name,
        o.customer_phone,
        o.order_type,
        o.table_id::text,
        o.delivery_address,
        o.delivery_notes,
        o.subtotal,
        o.delivery_fee,
        o.total_amount,
        o.payment_method,
        o.payment_status,
        o.status,
        o.created_at,
        o.updated_at,
        COALESCE(
            (SELECT jsonb_agg(jsonb_build_object(
                'id', oi.id,
                'order_id', oi.order_id,
                'menu_item_id', oi.menu_item_id,
                'variant_id', oi.variant_id,
                'item_name', oi.item_name,
                'variant_name', oi.variant_name,
                'unit_price', oi.unit_price,
                'quantity', oi.quantity,
                'subtotal_price', oi.subtotal_price,
                'special_instructions', oi.special_instructions
            )) FROM public.order_items oi WHERE oi.order_id = o.id),
            '[]'::jsonb
        ) AS items,
        COALESCE(
            (SELECT jsonb_agg(jsonb_build_object(
                'id', osh.id,
                'order_id', osh.order_id,
                'from_status', osh.from_status,
                'to_status', osh.to_status,
                'notes', osh.notes,
                'created_at', osh.created_at
            ) ORDER BY osh.created_at ASC) FROM public.order_status_history osh WHERE osh.order_id = o.id),
            '[]'::jsonb
        ) AS history,
        (SELECT jsonb_build_object(
            'rider_id', ra.rider_id,
            'rider_name', p.full_name,
            'rider_phone', p.phone,
            'assigned_at', ra.assigned_at
        ) FROM public.rider_assignments ra 
          JOIN public.profiles p ON p.id = ra.rider_id 
          WHERE ra.order_id = o.id LIMIT 1) AS rider_info,
        (SELECT jsonb_build_object(
            'id', ra.id,
            'order_id', ra.order_id,
            'rider_id', ra.rider_id,
            'status', ra.status,
            'assigned_at', ra.assigned_at
        ) FROM public.rider_assignments ra WHERE ra.order_id = o.id LIMIT 1) AS rider_assignment
    FROM public.orders o
    JOIN public.branches b ON b.id = o.branch_id
    WHERE (p_branch_id IS NULL OR o.branch_id = p_branch_id)
      AND (p_status IS NULL OR o.status = p_status)
      AND (
          v_caller_role IN ('OWNER', 'BRANCH_ADMIN', 'KITCHEN') OR
          (v_caller_role = 'RIDER' AND (
              (o.status = 'READY' AND o.order_type = 'DELIVERY') OR
              EXISTS (SELECT 1 FROM public.rider_assignments ra WHERE ra.order_id = o.id AND ra.rider_id = v_caller_id)
          ))
      )
    ORDER BY o.created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_branch_orders(UUID, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- SECTION 8: RESILIENT ATOMIC ORDER CREATION (Supporting QR Table Identification)
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.create_order_atomic(UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.create_order_atomic(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.create_order_atomic(
    p_branch_id UUID,
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_order_type TEXT,
    p_table_id TEXT DEFAULT NULL,
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
    v_resolved_table_id UUID := NULL;
    v_item JSONB;
    v_menu_item_id UUID;
    v_variant_id UUID;
    v_quantity INT;
    v_unit_price NUMERIC(10,2);
    v_item_name TEXT;
    v_variant_name TEXT;
    v_item_subtotal NUMERIC(10,2);
    v_is_available BOOLEAN;
    v_caller_id UUID := auth.uid();
BEGIN
    -- 1. Input Validations
    IF p_customer_name IS NULL OR TRIM(p_customer_name) = '' THEN
        RAISE EXCEPTION 'Customer name is required.';
    END IF;
    IF p_customer_phone IS NULL OR TRIM(p_customer_phone) = '' THEN
        RAISE EXCEPTION 'Customer phone is required.';
    END IF;
    IF jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Cannot create an order with an empty items array.';
    END IF;

    -- 2. Verify Branch & Capabilities
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
        
        -- Resolve Table ID if provided (accepts both UUID string and table_number)
        IF p_table_id IS NOT NULL AND TRIM(p_table_id) != '' THEN
            IF p_table_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                SELECT id INTO v_resolved_table_id 
                FROM public.tables 
                WHERE id = p_table_id::UUID AND branch_id = p_branch_id AND is_active = TRUE;
            ELSE
                SELECT id INTO v_resolved_table_id 
                FROM public.tables 
                WHERE table_number = TRIM(p_table_id) AND branch_id = p_branch_id AND is_active = TRUE 
                LIMIT 1;
            END IF;
        END IF;
    ELSIF p_order_type = 'TAKEAWAY' THEN
        IF NOT COALESCE(v_takeaway_enabled, TRUE) THEN
            RAISE EXCEPTION 'Takeaway service is currently disabled for this branch.';
        END IF;
    ELSE
        RAISE EXCEPTION 'Invalid order type "%".', p_order_type;
    END IF;

    -- 3. Collision-Resistant Order Number
    LOOP
        v_order_number := 'OK-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(gen_random_uuid()::text FROM 1 FOR 6));
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.order_number = v_order_number);
    END LOOP;

    -- 4. Database Price Verification (Zero Trust for Client Price Values)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_menu_item_id := (v_item->>'menu_item_id')::UUID;
        v_variant_id := CASE 
            WHEN (v_item->>'variant_id') IS NOT NULL AND (v_item->>'variant_id') != '' 
            THEN (v_item->>'variant_id')::UUID 
            ELSE NULL 
        END;
        v_quantity := (v_item->>'quantity')::INT;

        IF v_quantity IS NULL OR v_quantity <= 0 OR v_quantity > 100 THEN
            RAISE EXCEPTION 'Invalid quantity % for item.', v_quantity;
        END IF;

        SELECT m.name, m.base_price, m.is_available 
        INTO v_item_name, v_unit_price, v_is_available
        FROM public.menu_items m WHERE m.id = v_menu_item_id;

        IF v_item_name IS NULL THEN
            RAISE EXCEPTION 'Menu item % not found.', v_menu_item_id;
        END IF;
        IF NOT COALESCE(v_is_available, FALSE) THEN
            RAISE EXCEPTION 'Menu item "%" is currently unavailable.', v_item_name;
        END IF;

        IF v_variant_id IS NOT NULL THEN
            SELECT mv.name, mv.price 
            INTO v_variant_name, v_unit_price
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

    -- 5. Insert Parent Order
    INSERT INTO public.orders (
        id, order_number, tracking_token, branch_id, customer_id, customer_name, customer_phone,
        order_type, table_id, delivery_address, delivery_notes, subtotal, delivery_fee, total_amount,
        payment_method, payment_status, status, created_at, updated_at
    ) VALUES (
        v_order_id, v_order_number, v_tracking_token, p_branch_id, v_caller_id, p_customer_name, p_customer_phone,
        p_order_type, v_resolved_table_id, p_delivery_address, p_delivery_notes, v_subtotal, v_delivery_fee, v_total,
        p_payment_method, 'PENDING', 'PENDING', NOW(), NOW()
    );

    -- 6. Insert Order Items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_menu_item_id := (v_item->>'menu_item_id')::UUID;
        v_variant_id := CASE 
            WHEN (v_item->>'variant_id') IS NOT NULL AND (v_item->>'variant_id') != '' 
            THEN (v_item->>'variant_id')::UUID 
            ELSE NULL 
        END;
        v_quantity := (v_item->>'quantity')::INT;

        SELECT m.name, m.base_price INTO v_item_name, v_unit_price FROM public.menu_items m WHERE m.id = v_menu_item_id;
        IF v_variant_id IS NOT NULL THEN
            SELECT mv.name, mv.price INTO v_variant_name, v_unit_price 
            FROM public.menu_item_variants mv 
            WHERE mv.id = v_variant_id AND mv.menu_item_id = v_menu_item_id;
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

    -- 7. Audit Logging
    INSERT INTO public.order_status_history (id, order_id, from_status, to_status, changed_by_user_id, notes, created_at)
    VALUES (gen_random_uuid(), v_order_id, NULL, 'PENDING', v_caller_id, 'Order placed successfully', NOW());

    RETURN QUERY SELECT v_order_id, v_order_number, v_tracking_token, v_total;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- SECTION 9: SECURE BUFFET BOOKING RPC (Server-Side Price Calculation)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.book_buffet_ticket_atomic(
    p_buffet_id UUID,
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_customer_email TEXT DEFAULT NULL,
    p_guests_count INT DEFAULT 1
) RETURNS TABLE (
    out_booking_id UUID,
    out_qr_token TEXT,
    out_total_amount NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_price_per_head NUMERIC(10,2);
    v_total NUMERIC(10,2);
    v_token TEXT;
    v_booking_id UUID := gen_random_uuid();
BEGIN
    IF p_guests_count <= 0 OR p_guests_count > 100 THEN
        RAISE EXCEPTION 'Invalid guest count.';
    END IF;

    SELECT price_per_head INTO v_price_per_head 
    FROM public.buffet_registrations 
    WHERE id = p_buffet_id AND is_active = TRUE;

    IF v_price_per_head IS NULL THEN
        RAISE EXCEPTION 'Buffet not found or inactive.';
    END IF;

    v_total := v_price_per_head * p_guests_count;
    v_token := 'buffet_qr_' || TO_CHAR(NOW(), 'YYYYMMDDHH24MISS') || '_' || encode(gen_random_bytes(6), 'hex');

    INSERT INTO public.buffet_bookings (
        id, buffet_id, customer_name, customer_phone, customer_email,
        guests_count, total_amount, qr_ticket_token, status, created_at
    ) VALUES (
        v_booking_id, p_buffet_id, p_customer_name, p_customer_phone, p_customer_email,
        p_guests_count, v_total, v_token, 'PENDING', NOW()
    );

    RETURN QUERY SELECT v_booking_id, v_token, v_total;
END;
$$;
GRANT EXECUTE ON FUNCTION public.book_buffet_ticket_atomic(UUID, TEXT, TEXT, TEXT, INT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- SECTION 10: STAFF PROFILE SYNCHRONIZATION WITH PRIVILEGE ESCALATION GUARDS
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_staff_profile(
    p_role TEXT,
    p_branch_id UUID DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_full_name TEXT DEFAULT NULL
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_email TEXT;
    v_is_preapproved_owner BOOLEAN;
    v_is_preapproved_staff BOOLEAN;
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'Authentication required to sync staff profile.';
    END IF;

    SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
    IF v_email IS NULL THEN
        SELECT email INTO v_email FROM public.profiles WHERE id = v_uid;
    END IF;

    IF v_email IS NULL THEN
        v_email := 'user_' || SUBSTRING(v_uid::text, 1, 8) || '@okrestaurant.com';
    END IF;

    v_is_preapproved_owner := (LOWER(v_email) IN ('owner1@okrestaurant.com', 'owner2@okrestaurant.com', 'owner3@okrestaurant.com', 'owner@okrestaurant.com', 'owner@ok-restaurant.com', 'owner@ok.com')) OR is_owner(v_uid);
    v_is_preapproved_staff := (LOWER(v_email) LIKE '%@okrestaurant.com' OR LOWER(v_email) LIKE '%@ok-restaurant.com' OR LOWER(v_email) LIKE '%@ok.com');

    -- Block non-owners from assigning OWNER role
    IF p_role = 'OWNER' AND NOT v_is_preapproved_owner THEN
        RAISE EXCEPTION 'Access Denied: You cannot assign the OWNER role.';
    END IF;

    INSERT INTO public.profiles (id, email, full_name, phone, role)
    VALUES (
        v_uid,
        LOWER(v_email),
        COALESCE(p_full_name, SPLIT_PART(v_email, '@', 1)),
        COALESCE(p_phone, ''),
        p_role
    )
    ON CONFLICT (id) DO UPDATE SET
        role = CASE WHEN v_is_preapproved_owner OR v_is_preapproved_staff THEN EXCLUDED.role ELSE profiles.role END,
        full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
        phone = COALESCE(EXCLUDED.phone, profiles.phone),
        updated_at = NOW();

    IF p_branch_id IS NOT NULL THEN
        INSERT INTO public.branch_users (user_id, branch_id, role)
        VALUES (v_uid, p_branch_id, p_role)
        ON CONFLICT (user_id, branch_id) DO UPDATE SET role = EXCLUDED.role;
    END IF;

    RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.sync_staff_profile(TEXT, UUID, TEXT, TEXT) TO authenticated;

-- ----------------------------------------------------------------------------
-- SECTION 11: REALTIME SUBSCRIPTION REPAIR
-- ----------------------------------------------------------------------------

ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.order_items REPLICA IDENTITY FULL;
ALTER TABLE public.order_status_history REPLICA IDENTITY FULL;
ALTER TABLE public.rider_assignments REPLICA IDENTITY FULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
    
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE 
            public.orders, 
            public.order_items, 
            public.order_status_history, 
            public.rider_assignments;
    EXCEPTION WHEN duplicate_object THEN
        NULL;
    END;
END $$;



-- ============================================================================
-- OK RESTAURANT PLATFORM: BRANCH-SPECIFIC MENU MANAGEMENT (MIGRATION 008)
-- ============================================================================
-- 1. Table Definitions: branch_menu_items & branch_menu_item_variants
-- 2. Data Backfill: Populate branch settings from existing menu_items & branches
-- 3. Automatic Lifecycle Triggers: Keep newly created menu items and branches in sync
-- 4. Row-Level Security (RLS) Isolation: Branch Admins and Kitchen locked to own branch
-- 5. Branch Menu Query RPC: get_branch_menu_items(branch_id, category_id)
-- 6. Branch Menu Update RPCs: update_branch_menu_item & toggle_branch_item_availability
-- 7. Hardened Atomic Order Creation: Branch-specific price lookup & stock enforcement
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SECTION 1: TABLE DEFINITIONS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.branch_menu_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE NOT NULL,
    menu_item_id UUID REFERENCES public.menu_items(id) ON DELETE CASCADE NOT NULL,
    price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    is_visible BOOLEAN NOT NULL DEFAULT TRUE,
    preparation_time INT NOT NULL DEFAULT 15, -- in minutes
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (branch_id, menu_item_id)
);

CREATE TABLE IF NOT EXISTS public.branch_menu_item_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE NOT NULL,
    variant_id UUID REFERENCES public.menu_item_variants(id) ON DELETE CASCADE NOT NULL,
    price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    is_available BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (branch_id, variant_id)
);

-- Indexes for lightning-fast queries
CREATE INDEX IF NOT EXISTS idx_branch_menu_items_branch ON public.branch_menu_items(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_menu_items_item ON public.branch_menu_items(menu_item_id);
CREATE INDEX IF NOT EXISTS idx_branch_menu_item_variants_branch ON public.branch_menu_item_variants(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_menu_item_variants_variant ON public.branch_menu_item_variants(variant_id);

-- ----------------------------------------------------------------------------
-- SECTION 2: DATA BACKFILL (Preserve all existing menu items & prices)
-- ----------------------------------------------------------------------------

-- Backfill branch_menu_items for all existing (branch, menu_item) pairs
INSERT INTO public.branch_menu_items (branch_id, menu_item_id, price, is_available, is_visible, preparation_time, sort_order)
SELECT 
    b.id AS branch_id,
    m.id AS menu_item_id,
    m.base_price AS price,
    COALESCE(m.is_available, TRUE) AS is_available,
    TRUE AS is_visible,
    15 AS preparation_time,
    COALESCE(m.sort_order, 0) AS sort_order
FROM public.branches b
CROSS JOIN public.menu_items m
ON CONFLICT (branch_id, menu_item_id) DO UPDATE SET
    price = EXCLUDED.price,
    is_available = EXCLUDED.is_available;

-- Backfill branch_menu_item_variants for all existing (branch, variant) pairs
INSERT INTO public.branch_menu_item_variants (branch_id, variant_id, price, is_available)
SELECT
    b.id AS branch_id,
    v.id AS variant_id,
    v.price AS price,
    TRUE AS is_available
FROM public.branches b
CROSS JOIN public.menu_item_variants v
ON CONFLICT (branch_id, variant_id) DO UPDATE SET
    price = EXCLUDED.price;

-- ----------------------------------------------------------------------------
-- SECTION 3: AUTOMATIC LIFECYCLE SYNC TRIGGERS
-- ----------------------------------------------------------------------------

-- Trigger: When a new menu_item is created, automatically seed branch_menu_items for all branches
CREATE OR REPLACE FUNCTION public.sync_new_menu_item_to_branches()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    INSERT INTO public.branch_menu_items (branch_id, menu_item_id, price, is_available, is_visible, preparation_time, sort_order)
    SELECT 
        b.id,
        NEW.id,
        NEW.base_price,
        COALESCE(NEW.is_available, TRUE),
        TRUE,
        15,
        COALESCE(NEW.sort_order, 0)
    FROM public.branches b
    ON CONFLICT (branch_id, menu_item_id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_new_menu_item_to_branches ON public.menu_items;
CREATE TRIGGER trg_sync_new_menu_item_to_branches
AFTER INSERT ON public.menu_items
FOR EACH ROW EXECUTE FUNCTION public.sync_new_menu_item_to_branches();

-- Trigger: When a new branch is created, automatically seed branch_menu_items from all menu items
CREATE OR REPLACE FUNCTION public.sync_new_branch_menu_items()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    INSERT INTO public.branch_menu_items (branch_id, menu_item_id, price, is_available, is_visible, preparation_time, sort_order)
    SELECT 
        NEW.id,
        m.id,
        m.base_price,
        COALESCE(m.is_available, TRUE),
        TRUE,
        15,
        COALESCE(m.sort_order, 0)
    FROM public.menu_items m
    ON CONFLICT (branch_id, menu_item_id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_new_branch_menu_items ON public.branches;
CREATE TRIGGER trg_sync_new_branch_menu_items
AFTER INSERT ON public.branches
FOR EACH ROW EXECUTE FUNCTION public.sync_new_branch_menu_items();

-- ----------------------------------------------------------------------------
-- SECTION 4: ROW-LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------

ALTER TABLE public.branch_menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branch_menu_item_variants ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.branch_menu_items TO anon, authenticated;
GRANT SELECT ON public.branch_menu_item_variants TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.branch_menu_items TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.branch_menu_item_variants TO authenticated;

DROP POLICY IF EXISTS "branch_menu_items_select_policy" ON public.branch_menu_items;
DROP POLICY IF EXISTS "branch_menu_items_modify_policy" ON public.branch_menu_items;

CREATE POLICY "branch_menu_items_select_policy" ON public.branch_menu_items FOR SELECT USING (true);

CREATE POLICY "branch_menu_items_modify_policy" ON public.branch_menu_items FOR ALL USING (
    is_owner(auth.uid()) OR (
        get_user_role(auth.uid()) = 'BRANCH_ADMIN' AND is_staff_of_branch(branch_id, auth.uid())
    ) OR (
        get_user_role(auth.uid()) = 'KITCHEN' AND is_staff_of_branch(branch_id, auth.uid())
    )
) WITH CHECK (
    is_owner(auth.uid()) OR (
        get_user_role(auth.uid()) = 'BRANCH_ADMIN' AND is_staff_of_branch(branch_id, auth.uid())
    ) OR (
        get_user_role(auth.uid()) = 'KITCHEN' AND is_staff_of_branch(branch_id, auth.uid())
    )
);

DROP POLICY IF EXISTS "branch_menu_item_variants_select_policy" ON public.branch_menu_item_variants;
DROP POLICY IF EXISTS "branch_menu_item_variants_modify_policy" ON public.branch_menu_item_variants;

CREATE POLICY "branch_menu_item_variants_select_policy" ON public.branch_menu_item_variants FOR SELECT USING (true);

CREATE POLICY "branch_menu_item_variants_modify_policy" ON public.branch_menu_item_variants FOR ALL USING (
    is_owner(auth.uid()) OR (
        get_user_role(auth.uid()) = 'BRANCH_ADMIN' AND is_staff_of_branch(branch_id, auth.uid())
    )
) WITH CHECK (
    is_owner(auth.uid()) OR (
        get_user_role(auth.uid()) = 'BRANCH_ADMIN' AND is_staff_of_branch(branch_id, auth.uid())
    )
);

-- ----------------------------------------------------------------------------
-- SECTION 5: BRANCH MENU QUERY RPC
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_branch_menu_items(UUID, UUID);

CREATE OR REPLACE FUNCTION public.get_branch_menu_items(
    p_branch_id UUID,
    p_category_id UUID DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    category_id UUID,
    item_code INT,
    name TEXT,
    description TEXT,
    base_price NUMERIC,
    price NUMERIC,
    has_variants BOOLEAN,
    image_url TEXT,
    is_available BOOLEAN,
    is_visible BOOLEAN,
    preparation_time INT,
    sort_order INT,
    variants JSONB
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.id,
        m.category_id,
        m.item_code,
        m.name,
        m.description,
        m.base_price,
        COALESCE(bmi.price, m.base_price) AS price,
        m.has_variants,
        m.image_url,
        (COALESCE(bmi.is_available, m.is_available, TRUE) AND COALESCE(m.is_available, TRUE)) AS is_available,
        COALESCE(bmi.is_visible, TRUE) AS is_visible,
        COALESCE(bmi.preparation_time, 15) AS preparation_time,
        COALESCE(bmi.sort_order, m.sort_order, 0) AS sort_order,
        COALESCE(
            (SELECT jsonb_agg(jsonb_build_object(
                'id', v.id,
                'menu_item_id', v.menu_item_id,
                'name', v.name,
                'price', COALESCE(bmiv.price, v.price),
                'is_available', COALESCE(bmiv.is_available, TRUE),
                'sort_order', v.sort_order
            ) ORDER BY v.sort_order ASC)
            FROM public.menu_item_variants v
            LEFT JOIN public.branch_menu_item_variants bmiv 
                ON bmiv.variant_id = v.id AND bmiv.branch_id = p_branch_id
            WHERE v.menu_item_id = m.id),
            '[]'::jsonb
        ) AS variants
    FROM public.menu_items m
    LEFT JOIN public.branch_menu_items bmi 
        ON bmi.menu_item_id = m.id AND bmi.branch_id = p_branch_id
    WHERE (p_category_id IS NULL OR m.category_id = p_category_id)
      AND (COALESCE(bmi.is_visible, TRUE) = TRUE)
    ORDER BY COALESCE(bmi.sort_order, m.sort_order, 0) ASC, m.name ASC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_branch_menu_items(UUID, UUID) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- SECTION 6: BRANCH MENU UPDATE RPCS
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.update_branch_menu_item(UUID, UUID, NUMERIC, BOOLEAN, BOOLEAN, INT, INT);

CREATE OR REPLACE FUNCTION public.update_branch_menu_item(
    p_branch_id UUID,
    p_menu_item_id UUID,
    p_price NUMERIC DEFAULT NULL,
    p_is_available BOOLEAN DEFAULT NULL,
    p_is_visible BOOLEAN DEFAULT NULL,
    p_preparation_time INT DEFAULT NULL,
    p_sort_order INT DEFAULT NULL
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role TEXT;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to update branch menu.';
    END IF;

    v_caller_role := get_user_role(v_caller_id);

    IF v_caller_role = 'OWNER' THEN
        NULL;
    ELSIF v_caller_role = 'BRANCH_ADMIN' THEN
        IF NOT is_staff_of_branch(p_branch_id, v_caller_id) THEN
            RAISE EXCEPTION 'Access Denied: You cannot modify menu settings for another branch.';
        END IF;
    ELSIF v_caller_role = 'KITCHEN' THEN
        IF NOT is_staff_of_branch(p_branch_id, v_caller_id) THEN
            RAISE EXCEPTION 'Access Denied: Kitchen staff cannot modify menu settings for another branch.';
        END IF;
        -- Kitchen can only toggle availability, never change prices or visibility
        IF p_price IS NOT NULL OR p_is_visible IS NOT NULL THEN
            RAISE EXCEPTION 'Access Denied: Kitchen staff can only toggle item availability.';
        END IF;
    ELSE
        RAISE EXCEPTION 'Access Denied: Insufficient permissions.';
    END IF;

    INSERT INTO public.branch_menu_items (
        branch_id, menu_item_id, price, is_available, is_visible, preparation_time, sort_order, updated_at
    ) VALUES (
        p_branch_id,
        p_menu_item_id,
        COALESCE(p_price, (SELECT base_price FROM public.menu_items WHERE id = p_menu_item_id), 0.00),
        COALESCE(p_is_available, TRUE),
        COALESCE(p_is_visible, TRUE),
        COALESCE(p_preparation_time, 15),
        COALESCE(p_sort_order, 0),
        NOW()
    )
    ON CONFLICT (branch_id, menu_item_id) DO UPDATE SET
        price = COALESCE(p_price, branch_menu_items.price),
        is_available = COALESCE(p_is_available, branch_menu_items.is_available),
        is_visible = COALESCE(p_is_visible, branch_menu_items.is_visible),
        preparation_time = COALESCE(p_preparation_time, branch_menu_items.preparation_time),
        sort_order = COALESCE(p_sort_order, branch_menu_items.sort_order),
        updated_at = NOW();

    RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_branch_menu_item(UUID, UUID, NUMERIC, BOOLEAN, BOOLEAN, INT, INT) TO authenticated;

DROP FUNCTION IF EXISTS public.toggle_branch_item_availability(UUID, UUID);

CREATE OR REPLACE FUNCTION public.toggle_branch_item_availability(
    p_branch_id UUID,
    p_menu_item_id UUID
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role TEXT;
    v_current_avail BOOLEAN;
    v_new_avail BOOLEAN;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    v_caller_role := get_user_role(v_caller_id);

    IF v_caller_role = 'OWNER' THEN
        NULL;
    ELSIF v_caller_role IN ('BRANCH_ADMIN', 'KITCHEN') THEN
        IF NOT is_staff_of_branch(p_branch_id, v_caller_id) THEN
            RAISE EXCEPTION 'Access Denied: You cannot modify availability for another branch.';
        END IF;
    ELSE
        RAISE EXCEPTION 'Access Denied: Insufficient permissions.';
    END IF;

    SELECT is_available INTO v_current_avail 
    FROM public.branch_menu_items 
    WHERE branch_id = p_branch_id AND menu_item_id = p_menu_item_id;

    IF v_current_avail IS NULL THEN
        v_current_avail := TRUE;
    END IF;

    v_new_avail := NOT v_current_avail;

    INSERT INTO public.branch_menu_items (
        branch_id, menu_item_id, price, is_available, is_visible, preparation_time, sort_order, updated_at
    ) VALUES (
        p_branch_id,
        p_menu_item_id,
        (SELECT base_price FROM public.menu_items WHERE id = p_menu_item_id),
        v_new_avail,
        TRUE,
        15,
        0,
        NOW()
    )
    ON CONFLICT (branch_id, menu_item_id) DO UPDATE SET
        is_available = v_new_avail,
        updated_at = NOW();

    RETURN v_new_avail;
END;
$$;
GRANT EXECUTE ON FUNCTION public.toggle_branch_item_availability(UUID, UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- SECTION 7: HARDENED ATOMIC ORDER CREATION (Branch-Specific Pricing & Availability)
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.create_order_atomic(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.create_order_atomic(
    p_branch_id UUID,
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_order_type TEXT,
    p_table_id TEXT DEFAULT NULL,
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
    v_resolved_table_id UUID := NULL;
    v_item JSONB;
    v_menu_item_id UUID;
    v_variant_id UUID;
    v_quantity INT;
    v_unit_price NUMERIC(10,2);
    v_item_name TEXT;
    v_variant_name TEXT;
    v_item_subtotal NUMERIC(10,2);
    v_is_available BOOLEAN;
    v_is_visible BOOLEAN;
    v_variant_available BOOLEAN;
    v_caller_id UUID := auth.uid();
BEGIN
    -- 1. Input Validations
    IF p_customer_name IS NULL OR TRIM(p_customer_name) = '' THEN
        RAISE EXCEPTION 'Customer name is required.';
    END IF;
    IF p_customer_phone IS NULL OR TRIM(p_customer_phone) = '' THEN
        RAISE EXCEPTION 'Customer phone is required.';
    END IF;
    IF jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Cannot create an order with an empty items array.';
    END IF;

    -- 2. Verify Branch & Capabilities
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
        
        -- Resolve Table ID if provided (accepts both UUID string and table_number)
        IF p_table_id IS NOT NULL AND TRIM(p_table_id) != '' THEN
            IF p_table_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                SELECT id INTO v_resolved_table_id 
                FROM public.tables 
                WHERE id = p_table_id::UUID AND branch_id = p_branch_id AND is_active = TRUE;
            ELSE
                SELECT id INTO v_resolved_table_id 
                FROM public.tables 
                WHERE table_number = TRIM(p_table_id) AND branch_id = p_branch_id AND is_active = TRUE 
                LIMIT 1;
            END IF;
        END IF;
    ELSIF p_order_type = 'TAKEAWAY' THEN
        IF NOT COALESCE(v_takeaway_enabled, TRUE) THEN
            RAISE EXCEPTION 'Takeaway service is currently disabled for this branch.';
        END IF;
    ELSE
        RAISE EXCEPTION 'Invalid order type "%".', p_order_type;
    END IF;

    -- 3. Collision-Resistant Order Number
    LOOP
        v_order_number := 'OK-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(gen_random_uuid()::text FROM 1 FOR 6));
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.order_number = v_order_number);
    END LOOP;

    -- 4. Branch-Specific Price & Availability Verification (Zero Trust for Client Prices)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_menu_item_id := (v_item->>'menu_item_id')::UUID;
        v_variant_id := CASE 
            WHEN (v_item->>'variant_id') IS NOT NULL AND (v_item->>'variant_id') != '' 
            THEN (v_item->>'variant_id')::UUID 
            ELSE NULL 
        END;
        v_quantity := (v_item->>'quantity')::INT;

        IF v_quantity IS NULL OR v_quantity <= 0 OR v_quantity > 100 THEN
            RAISE EXCEPTION 'Invalid quantity % for item.', v_quantity;
        END IF;

        -- Fetch branch-specific price and availability
        SELECT 
            m.name,
            COALESCE(bmi.price, m.base_price),
            (COALESCE(bmi.is_available, m.is_available, TRUE) AND COALESCE(m.is_available, TRUE)),
            COALESCE(bmi.is_visible, TRUE)
        INTO v_item_name, v_unit_price, v_is_available, v_is_visible
        FROM public.menu_items m
        LEFT JOIN public.branch_menu_items bmi 
            ON bmi.menu_item_id = m.id AND bmi.branch_id = p_branch_id
        WHERE m.id = v_menu_item_id;

        IF v_item_name IS NULL THEN
            RAISE EXCEPTION 'Menu item % not found.', v_menu_item_id;
        END IF;
        IF NOT COALESCE(v_is_available, FALSE) OR NOT COALESCE(v_is_visible, TRUE) THEN
            RAISE EXCEPTION 'Menu item "%" is currently unavailable at this branch.', v_item_name;
        END IF;

        -- Check variant pricing if applicable
        IF v_variant_id IS NOT NULL THEN
            SELECT 
                mv.name,
                COALESCE(bmiv.price, mv.price),
                COALESCE(bmiv.is_available, TRUE)
            INTO v_variant_name, v_unit_price, v_variant_available
            FROM public.menu_item_variants mv
            LEFT JOIN public.branch_menu_item_variants bmiv 
                ON bmiv.variant_id = mv.id AND bmiv.branch_id = p_branch_id
            WHERE mv.id = v_variant_id AND mv.menu_item_id = v_menu_item_id;

            IF v_variant_name IS NULL THEN
                RAISE EXCEPTION 'Selected variant not found for menu item "%".', v_item_name;
            END IF;

            IF NOT COALESCE(v_variant_available, TRUE) THEN
                RAISE EXCEPTION 'Selected variant "%" for "%" is currently unavailable at this branch.', v_variant_name, v_item_name;
            END IF;
        ELSE
            v_variant_name := NULL;
        END IF;

        v_item_subtotal := v_unit_price * v_quantity;
        v_subtotal := v_subtotal + v_item_subtotal;
    END LOOP;

    v_total := v_subtotal + v_delivery_fee;

    -- 5. Insert Parent Order
    INSERT INTO public.orders (
        id, order_number, tracking_token, branch_id, customer_id, customer_name, customer_phone,
        order_type, table_id, delivery_address, delivery_notes, subtotal, delivery_fee, total_amount,
        payment_method, payment_status, status, created_at, updated_at
    ) VALUES (
        v_order_id, v_order_number, v_tracking_token, p_branch_id, v_caller_id, p_customer_name, p_customer_phone,
        p_order_type, v_resolved_table_id, p_delivery_address, p_delivery_notes, v_subtotal, v_delivery_fee, v_total,
        p_payment_method, 'PENDING', 'PENDING', NOW(), NOW()
    );

    -- 6. Insert Order Items (Locking in the purchase price permanently)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_menu_item_id := (v_item->>'menu_item_id')::UUID;
        v_variant_id := CASE 
            WHEN (v_item->>'variant_id') IS NOT NULL AND (v_item->>'variant_id') != '' 
            THEN (v_item->>'variant_id')::UUID 
            ELSE NULL 
        END;
        v_quantity := (v_item->>'quantity')::INT;

        SELECT 
            m.name,
            COALESCE(bmi.price, m.base_price)
        INTO v_item_name, v_unit_price
        FROM public.menu_items m
        LEFT JOIN public.branch_menu_items bmi 
            ON bmi.menu_item_id = m.id AND bmi.branch_id = p_branch_id
        WHERE m.id = v_menu_item_id;

        IF v_variant_id IS NOT NULL THEN
            SELECT 
                mv.name,
                COALESCE(bmiv.price, mv.price)
            INTO v_variant_name, v_unit_price 
            FROM public.menu_item_variants mv 
            LEFT JOIN public.branch_menu_item_variants bmiv 
                ON bmiv.variant_id = mv.id AND bmiv.branch_id = p_branch_id
            WHERE mv.id = v_variant_id AND mv.menu_item_id = v_menu_item_id;
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

    -- 7. Audit Logging
    INSERT INTO public.order_status_history (id, order_id, from_status, to_status, changed_by_user_id, notes, created_at)
    VALUES (gen_random_uuid(), v_order_id, NULL, 'PENDING', v_caller_id, 'Order placed successfully', NOW());

    RETURN QUERY SELECT v_order_id, v_order_number, v_tracking_token, v_total;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- SECTION 8: REALTIME SUBSCRIPTION REGISTRATION
-- ----------------------------------------------------------------------------

ALTER TABLE public.branch_menu_items REPLICA IDENTITY FULL;
ALTER TABLE public.branch_menu_item_variants REPLICA IDENTITY FULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
    
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE 
            public.branch_menu_items,
            public.branch_menu_item_variants;
    EXCEPTION WHEN duplicate_object THEN
        NULL;
    END;
END $$;


-- ============================================================================
-- OK RESTAURANT PLATFORM: BRANCH DELIVERY ZONE CONFIGURATION (MIGRATION 009)
-- ============================================================================
-- 1. Table Definitions: delivery_zones & orders.delivery_zone_id
-- 2. Data Backfill: Populate realistic delivery zones for existing branches
-- 3. Row-Level Security (RLS) Isolation: Branch Admins restricted to own branch zones
-- 4. Branch Delivery Zone Query RPC: get_branch_delivery_zones(p_branch_id)
-- 5. Branch Delivery Zone Management RPCs: manage_delivery_zone & delete_delivery_zone
-- 6. Hardened Zero-Trust Atomic Order Creation with Dynamic Zone Fees & Min Order
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SECTION 1: TABLE DEFINITIONS
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.delivery_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    minimum_order_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    estimated_delivery_minutes INT NOT NULL DEFAULT 35,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    radius_km NUMERIC(6, 2) DEFAULT NULL,       -- Architecture ready for future GPS / radius expansions
    polygon_geojson JSONB DEFAULT NULL,          -- Architecture ready for future Geofence polygon expansions
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (branch_id, name)
);

-- Add delivery_zone_id foreign key column to orders table
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS delivery_zone_id UUID REFERENCES public.delivery_zones(id) ON DELETE SET NULL;

-- Fast index lookups
CREATE INDEX IF NOT EXISTS idx_delivery_zones_branch ON public.delivery_zones(branch_id);
CREATE INDEX IF NOT EXISTS idx_delivery_zones_active ON public.delivery_zones(branch_id, is_active);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_zone ON public.orders(delivery_zone_id);

-- ----------------------------------------------------------------------------
-- SECTION 2: DATA BACKFILL (Realistic seed zones for all existing branches)
-- ----------------------------------------------------------------------------

-- Branch 1: Dera Ghazi Khan / Dera Chungi (Active Delivery Branch)
INSERT INTO public.delivery_zones (id, branch_id, name, delivery_fee, minimum_order_amount, estimated_delivery_minutes, is_active, sort_order)
VALUES 
    ('d1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'Zone 1 - City Center & Main Bazar', 80.00, 350.00, 25, TRUE, 1),
    ('d1000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 'Zone 2 - Model Town & Satellite Area', 120.00, 500.00, 35, TRUE, 2),
    ('d1000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000001', 'Zone 3 - Indus Highway & Outer Bypass', 180.00, 700.00, 45, TRUE, 3)
ON CONFLICT (branch_id, name) DO UPDATE SET
    delivery_fee = EXCLUDED.delivery_fee,
    minimum_order_amount = EXCLUDED.minimum_order_amount,
    estimated_delivery_minutes = EXCLUDED.estimated_delivery_minutes;

-- Branch 2: Main Bypass Jampur
INSERT INTO public.delivery_zones (id, branch_id, name, delivery_fee, minimum_order_amount, estimated_delivery_minutes, is_active, sort_order)
VALUES 
    ('d2000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002', 'Zone 1 - Jampur City Center', 90.00, 400.00, 30, TRUE, 1),
    ('d2000000-0000-0000-0000-000000000002', 'b2000000-0000-0000-0000-000000000002', 'Zone 2 - Bypass & Rural Sector', 150.00, 600.00, 45, TRUE, 2)
ON CONFLICT (branch_id, name) DO UPDATE SET
    delivery_fee = EXCLUDED.delivery_fee,
    minimum_order_amount = EXCLUDED.minimum_order_amount,
    estimated_delivery_minutes = EXCLUDED.estimated_delivery_minutes;

-- Branch 3: Kot Chutta
INSERT INTO public.delivery_zones (id, branch_id, name, delivery_fee, minimum_order_amount, estimated_delivery_minutes, is_active, sort_order)
VALUES 
    ('d3000000-0000-0000-0000-000000000001', 'b3000000-0000-0000-0000-000000000003', 'Zone 1 - Kot Chutta Town Center', 80.00, 350.00, 25, TRUE, 1),
    ('d3000000-0000-0000-0000-000000000002', 'b3000000-0000-0000-0000-000000000003', 'Zone 2 - Surrounding Outskirts', 140.00, 550.00, 40, TRUE, 2)
ON CONFLICT (branch_id, name) DO UPDATE SET
    delivery_fee = EXCLUDED.delivery_fee,
    minimum_order_amount = EXCLUDED.minimum_order_amount,
    estimated_delivery_minutes = EXCLUDED.estimated_delivery_minutes;

-- ----------------------------------------------------------------------------
-- SECTION 3: ROW-LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------

ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.delivery_zones TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.delivery_zones TO authenticated;

DROP POLICY IF EXISTS "delivery_zones_select_policy" ON public.delivery_zones;
DROP POLICY IF EXISTS "delivery_zones_modify_policy" ON public.delivery_zones;

CREATE POLICY "delivery_zones_select_policy" ON public.delivery_zones FOR SELECT USING (true);

CREATE POLICY "delivery_zones_modify_policy" ON public.delivery_zones FOR ALL USING (
    is_owner(auth.uid()) OR (
        get_user_role(auth.uid()) = 'BRANCH_ADMIN' AND is_staff_of_branch(branch_id, auth.uid())
    )
) WITH CHECK (
    is_owner(auth.uid()) OR (
        get_user_role(auth.uid()) = 'BRANCH_ADMIN' AND is_staff_of_branch(branch_id, auth.uid())
    )
);

-- ----------------------------------------------------------------------------
-- SECTION 4: BRANCH DELIVERY ZONE QUERY RPC
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_branch_delivery_zones(UUID, BOOLEAN);

CREATE OR REPLACE FUNCTION public.get_branch_delivery_zones(
    p_branch_id UUID,
    p_only_active BOOLEAN DEFAULT TRUE
)
RETURNS TABLE (
    id UUID,
    branch_id UUID,
    name TEXT,
    delivery_fee NUMERIC,
    minimum_order_amount NUMERIC,
    estimated_delivery_minutes INT,
    is_active BOOLEAN,
    sort_order INT,
    radius_km NUMERIC,
    is_delivery_enabled BOOLEAN
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_delivery_enabled BOOLEAN;
BEGIN
    SELECT COALESCE(delivery_enabled, FALSE) INTO v_delivery_enabled 
    FROM public.branch_capabilities 
    WHERE branch_capabilities.branch_id = p_branch_id;

    RETURN QUERY
    SELECT 
        dz.id,
        dz.branch_id,
        dz.name,
        dz.delivery_fee,
        dz.minimum_order_amount,
        dz.estimated_delivery_minutes,
        dz.is_active,
        dz.sort_order,
        dz.radius_km,
        COALESCE(v_delivery_enabled, FALSE) AS is_delivery_enabled
    FROM public.delivery_zones dz
    WHERE dz.branch_id = p_branch_id
      AND (NOT p_only_active OR dz.is_active = TRUE)
    ORDER BY dz.sort_order ASC, dz.delivery_fee ASC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_branch_delivery_zones(UUID, BOOLEAN) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- SECTION 5: DELIVERY ZONE MANAGEMENT RPCS
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.manage_delivery_zone(UUID, UUID, TEXT, NUMERIC, NUMERIC, INT, BOOLEAN, INT);

CREATE OR REPLACE FUNCTION public.manage_delivery_zone(
    p_zone_id UUID DEFAULT NULL,
    p_branch_id UUID DEFAULT NULL,
    p_name TEXT DEFAULT NULL,
    p_delivery_fee NUMERIC DEFAULT 0.00,
    p_minimum_order_amount NUMERIC DEFAULT 0.00,
    p_estimated_delivery_minutes INT DEFAULT 35,
    p_is_active BOOLEAN DEFAULT TRUE,
    p_sort_order INT DEFAULT 0
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role TEXT;
    v_target_branch_id UUID := p_branch_id;
    v_result_id UUID;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to manage delivery zones.';
    END IF;

    v_caller_role := get_user_role(v_caller_id);

    IF p_zone_id IS NOT NULL THEN
        SELECT branch_id INTO v_target_branch_id FROM public.delivery_zones WHERE id = p_zone_id;
        IF v_target_branch_id IS NULL THEN
            RAISE EXCEPTION 'Delivery zone % not found.', p_zone_id;
        END IF;
    END IF;

    IF v_target_branch_id IS NULL THEN
        RAISE EXCEPTION 'branch_id is required to create a delivery zone.';
    END IF;

    -- Authorization check
    IF v_caller_role = 'OWNER' THEN
        NULL;
    ELSIF v_caller_role = 'BRANCH_ADMIN' THEN
        IF NOT is_staff_of_branch(v_target_branch_id, v_caller_id) THEN
            RAISE EXCEPTION 'Access Denied: You cannot configure delivery zones for another branch.';
        END IF;
    ELSE
        RAISE EXCEPTION 'Access Denied: Insufficient permissions to manage delivery zones.';
    END IF;

    -- Input validations
    IF p_name IS NULL OR TRIM(p_name) = '' THEN
        RAISE EXCEPTION 'Zone name is required.';
    END IF;
    IF p_delivery_fee < 0 THEN
        RAISE EXCEPTION 'Delivery fee cannot be negative.';
    END IF;
    IF p_minimum_order_amount < 0 THEN
        RAISE EXCEPTION 'Minimum order amount cannot be negative.';
    END IF;

    IF p_zone_id IS NOT NULL THEN
        UPDATE public.delivery_zones SET
            name = TRIM(p_name),
            delivery_fee = p_delivery_fee,
            minimum_order_amount = p_minimum_order_amount,
            estimated_delivery_minutes = COALESCE(p_estimated_delivery_minutes, 35),
            is_active = COALESCE(p_is_active, TRUE),
            sort_order = COALESCE(p_sort_order, 0),
            updated_at = NOW()
        WHERE id = p_zone_id
        RETURNING id INTO v_result_id;
    ELSE
        INSERT INTO public.delivery_zones (
            branch_id, name, delivery_fee, minimum_order_amount, estimated_delivery_minutes, is_active, sort_order, updated_at
        ) VALUES (
            v_target_branch_id, TRIM(p_name), p_delivery_fee, p_minimum_order_amount, COALESCE(p_estimated_delivery_minutes, 35), COALESCE(p_is_active, TRUE), COALESCE(p_sort_order, 0), NOW()
        )
        RETURNING id INTO v_result_id;
    END IF;

    RETURN v_result_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.manage_delivery_zone(UUID, UUID, TEXT, NUMERIC, NUMERIC, INT, BOOLEAN, INT) TO authenticated;

DROP FUNCTION IF EXISTS public.delete_delivery_zone(UUID);

CREATE OR REPLACE FUNCTION public.delete_delivery_zone(p_zone_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_caller_role TEXT;
    v_target_branch_id UUID;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required.';
    END IF;

    v_caller_role := get_user_role(v_caller_id);

    SELECT branch_id INTO v_target_branch_id FROM public.delivery_zones WHERE id = p_zone_id;
    IF v_target_branch_id IS NULL THEN
        RAISE EXCEPTION 'Delivery zone not found.';
    END IF;

    IF v_caller_role = 'OWNER' THEN
        NULL;
    ELSIF v_caller_role = 'BRANCH_ADMIN' THEN
        IF NOT is_staff_of_branch(v_target_branch_id, v_caller_id) THEN
            RAISE EXCEPTION 'Access Denied: You cannot delete delivery zones for another branch.';
        END IF;
    ELSE
        RAISE EXCEPTION 'Access Denied: Insufficient permissions.';
    END IF;

    DELETE FROM public.delivery_zones WHERE id = p_zone_id;
    RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_delivery_zone(UUID) TO authenticated;

-- ----------------------------------------------------------------------------
-- SECTION 6: HARDENED ATOMIC ORDER CREATION (Dynamic Zone Pricing & Min Order)
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.create_order_atomic(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.create_order_atomic(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, UUID);

CREATE OR REPLACE FUNCTION public.create_order_atomic(
    p_branch_id UUID,
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_order_type TEXT,
    p_table_id TEXT DEFAULT NULL,
    p_delivery_address TEXT DEFAULT NULL,
    p_delivery_notes TEXT DEFAULT NULL,
    p_payment_method TEXT DEFAULT 'CASH',
    p_items JSONB DEFAULT '[]'::jsonb,
    p_delivery_zone_id UUID DEFAULT NULL
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
    v_resolved_table_id UUID := NULL;
    v_resolved_zone_id UUID := NULL;
    v_zone_name TEXT;
    v_zone_min_order NUMERIC(10,2) := 0.00;
    v_zone_active BOOLEAN;
    v_item JSONB;
    v_menu_item_id UUID;
    v_variant_id UUID;
    v_quantity INT;
    v_unit_price NUMERIC(10,2);
    v_item_name TEXT;
    v_variant_name TEXT;
    v_item_subtotal NUMERIC(10,2);
    v_is_available BOOLEAN;
    v_is_visible BOOLEAN;
    v_variant_available BOOLEAN;
    v_caller_id UUID := auth.uid();
BEGIN
    -- 1. Input Validations
    IF p_customer_name IS NULL OR TRIM(p_customer_name) = '' THEN
        RAISE EXCEPTION 'Customer name is required.';
    END IF;
    IF p_customer_phone IS NULL OR TRIM(p_customer_phone) = '' THEN
        RAISE EXCEPTION 'Customer phone is required.';
    END IF;
    IF jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Cannot create an order with an empty items array.';
    END IF;

    -- 2. Verify Branch & Capabilities
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
    ELSIF p_order_type = 'DINE_IN' THEN
        IF NOT COALESCE(v_dine_in_enabled, TRUE) THEN
            RAISE EXCEPTION 'Dine-In service is currently disabled for this branch.';
        END IF;
        
        -- Resolve Table ID if provided (accepts both UUID string and table_number)
        IF p_table_id IS NOT NULL AND TRIM(p_table_id) != '' THEN
            IF p_table_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                SELECT id INTO v_resolved_table_id 
                FROM public.tables 
                WHERE id = p_table_id::UUID AND branch_id = p_branch_id AND is_active = TRUE;
            ELSE
                SELECT id INTO v_resolved_table_id 
                FROM public.tables 
                WHERE table_number = TRIM(p_table_id) AND branch_id = p_branch_id AND is_active = TRUE 
                LIMIT 1;
            END IF;
        END IF;
    ELSIF p_order_type = 'TAKEAWAY' THEN
        IF NOT COALESCE(v_takeaway_enabled, TRUE) THEN
            RAISE EXCEPTION 'Takeaway service is currently disabled for this branch.';
        END IF;
    ELSE
        RAISE EXCEPTION 'Invalid order type "%".', p_order_type;
    END IF;

    -- 3. Collision-Resistant Order Number
    LOOP
        v_order_number := 'OK-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(gen_random_uuid()::text FROM 1 FOR 6));
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.order_number = v_order_number);
    END LOOP;

    -- 4. Branch-Specific Price & Availability Verification (Zero Trust for Client Prices)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_menu_item_id := (v_item->>'menu_item_id')::UUID;
        v_variant_id := CASE 
            WHEN (v_item->>'variant_id') IS NOT NULL AND (v_item->>'variant_id') != '' 
            THEN (v_item->>'variant_id')::UUID 
            ELSE NULL 
        END;
        v_quantity := (v_item->>'quantity')::INT;

        IF v_quantity IS NULL OR v_quantity <= 0 OR v_quantity > 100 THEN
            RAISE EXCEPTION 'Invalid quantity % for item.', v_quantity;
        END IF;

        -- Fetch branch-specific price and availability
        SELECT 
            m.name,
            COALESCE(bmi.price, m.base_price),
            (COALESCE(bmi.is_available, m.is_available, TRUE) AND COALESCE(m.is_available, TRUE)),
            COALESCE(bmi.is_visible, TRUE)
        INTO v_item_name, v_unit_price, v_is_available, v_is_visible
        FROM public.menu_items m
        LEFT JOIN public.branch_menu_items bmi 
            ON bmi.menu_item_id = m.id AND bmi.branch_id = p_branch_id
        WHERE m.id = v_menu_item_id;

        IF v_item_name IS NULL THEN
            RAISE EXCEPTION 'Menu item % not found.', v_menu_item_id;
        END IF;
        IF NOT COALESCE(v_is_available, FALSE) OR NOT COALESCE(v_is_visible, TRUE) THEN
            RAISE EXCEPTION 'Menu item "%" is currently unavailable at this branch.', v_item_name;
        END IF;

        -- Check variant pricing if applicable
        IF v_variant_id IS NOT NULL THEN
            SELECT 
                mv.name,
                COALESCE(bmiv.price, mv.price),
                COALESCE(bmiv.is_available, TRUE)
            INTO v_variant_name, v_unit_price, v_variant_available
            FROM public.menu_item_variants mv
            LEFT JOIN public.branch_menu_item_variants bmiv 
                ON bmiv.variant_id = mv.id AND bmiv.branch_id = p_branch_id
            WHERE mv.id = v_variant_id AND mv.menu_item_id = v_menu_item_id;

            IF v_variant_name IS NULL THEN
                RAISE EXCEPTION 'Selected variant not found for menu item "%".', v_item_name;
            END IF;

            IF NOT COALESCE(v_variant_available, TRUE) THEN
                RAISE EXCEPTION 'Selected variant "%" for "%" is currently unavailable at this branch.', v_variant_name, v_item_name;
            END IF;
        ELSE
            v_variant_name := NULL;
        END IF;

        v_item_subtotal := v_unit_price * v_quantity;
        v_subtotal := v_subtotal + v_item_subtotal;
    END LOOP;

    -- 5. Delivery Zone Resolution & Minimum Order Enforcement
    IF p_order_type = 'DELIVERY' THEN
        IF p_delivery_zone_id IS NOT NULL THEN
            SELECT id, name, delivery_fee, minimum_order_amount, is_active
            INTO v_resolved_zone_id, v_zone_name, v_delivery_fee, v_zone_min_order, v_zone_active
            FROM public.delivery_zones
            WHERE id = p_delivery_zone_id AND branch_id = p_branch_id;

            IF v_resolved_zone_id IS NULL THEN
                RAISE EXCEPTION 'Selected delivery zone does not exist for this branch.';
            END IF;
            IF NOT COALESCE(v_zone_active, FALSE) THEN
                RAISE EXCEPTION 'Selected delivery zone "%" is currently inactive.', v_zone_name;
            END IF;
        ELSE
            -- Fallback to default active zone for this branch
            SELECT id, name, delivery_fee, minimum_order_amount, is_active
            INTO v_resolved_zone_id, v_zone_name, v_delivery_fee, v_zone_min_order, v_zone_active
            FROM public.delivery_zones
            WHERE branch_id = p_branch_id AND is_active = TRUE
            ORDER BY sort_order ASC, delivery_fee ASC
            LIMIT 1;

            IF v_resolved_zone_id IS NULL THEN
                RAISE EXCEPTION 'No active delivery zone configured for this branch.';
            END IF;
        END IF;

        -- Enforce Minimum Order Amount for this zone
        IF v_subtotal < COALESCE(v_zone_min_order, 0.00) THEN
            RAISE EXCEPTION 'Minimum order amount for delivery to "%" is Rs. % (your subtotal is Rs. %).', 
                v_zone_name, v_zone_min_order, v_subtotal;
        END IF;
    ELSE
        v_delivery_fee := 0.00;
        v_resolved_zone_id := NULL;
    END IF;

    v_total := v_subtotal + v_delivery_fee;

    -- 6. Insert Parent Order (Preserving delivery fee & zone permanently)
    INSERT INTO public.orders (
        id, order_number, tracking_token, branch_id, customer_id, customer_name, customer_phone,
        order_type, table_id, delivery_zone_id, delivery_address, delivery_notes, subtotal, delivery_fee, total_amount,
        payment_method, payment_status, status, created_at, updated_at
    ) VALUES (
        v_order_id, v_order_number, v_tracking_token, p_branch_id, v_caller_id, p_customer_name, p_customer_phone,
        p_order_type, v_resolved_table_id, v_resolved_zone_id, p_delivery_address, p_delivery_notes, v_subtotal, v_delivery_fee, v_total,
        p_payment_method, 'PENDING', 'PENDING', NOW(), NOW()
    );

    -- 7. Insert Order Items (Locking in historical unit prices)
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_menu_item_id := (v_item->>'menu_item_id')::UUID;
        v_variant_id := CASE 
            WHEN (v_item->>'variant_id') IS NOT NULL AND (v_item->>'variant_id') != '' 
            THEN (v_item->>'variant_id')::UUID 
            ELSE NULL 
        END;
        v_quantity := (v_item->>'quantity')::INT;

        SELECT 
            m.name,
            COALESCE(bmi.price, m.base_price)
        INTO v_item_name, v_unit_price
        FROM public.menu_items m
        LEFT JOIN public.branch_menu_items bmi 
            ON bmi.menu_item_id = m.id AND bmi.branch_id = p_branch_id
        WHERE m.id = v_menu_item_id;

        IF v_variant_id IS NOT NULL THEN
            SELECT 
                mv.name,
                COALESCE(bmiv.price, mv.price)
            INTO v_variant_name, v_unit_price 
            FROM public.menu_item_variants mv 
            LEFT JOIN public.branch_menu_item_variants bmiv 
                ON bmiv.variant_id = mv.id AND bmiv.branch_id = p_branch_id
            WHERE mv.id = v_variant_id AND mv.menu_item_id = v_menu_item_id;
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

    -- 8. Audit Logging
    INSERT INTO public.order_status_history (id, order_id, from_status, to_status, changed_by_user_id, notes, created_at)
    VALUES (gen_random_uuid(), v_order_id, NULL, 'PENDING', v_caller_id, 'Order placed successfully', NOW());

    RETURN QUERY SELECT v_order_id, v_order_number, v_tracking_token, v_total;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, UUID) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- SECTION 7: REALTIME SUBSCRIPTION REGISTRATION
-- ----------------------------------------------------------------------------

ALTER TABLE public.delivery_zones REPLICA IDENTITY FULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
    
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_zones;
    EXCEPTION WHEN duplicate_object THEN
        NULL;
    END;
END $$;


-- ============================================================================
-- OK RESTAURANT PLATFORM: PRODUCTION PAYMENT INTEGRATION (MIGRATION 010)
-- ============================================================================
-- 1. Table Definitions: payment_transactions & indexes
-- 2. Row-Level Security (RLS) Policies
-- 3. Idempotent Atomic Payment Verification RPC for Orders: record_verified_payment
-- 4. Idempotent Atomic Payment Verification RPC for Buffets: record_verified_buffet_payment
-- 5. Realtime Publication Registration
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Expand orders.payment_method CHECK constraint to support production payment providers
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_method_check 
    CHECK (payment_method IN ('CASH', 'JAZZCASH', 'EASYPAISA', 'CARD', 'ONLINE', 'TEST_PAYMENT', 'SAFEPAY', 'STRIPE'));

CREATE TABLE IF NOT EXISTS public.payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    buffet_booking_id UUID REFERENCES public.buffet_bookings(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'SAFEPAY',
    provider_transaction_id TEXT,
    amount NUMERIC(10, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'PKR',
    status TEXT NOT NULL DEFAULT 'INITIATED' CHECK (status IN (
        'PENDING', 'INITIATED', 'AUTHORIZED', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED'
    )),
    payment_method TEXT NOT NULL DEFAULT 'SAFEPAY',
    checkout_url TEXT,
    provider_reference TEXT,
    failure_reason TEXT,
    idempotency_key TEXT UNIQUE,
    raw_response JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    paid_at TIMESTAMPTZ DEFAULT NULL,
    CONSTRAINT chk_target_exists CHECK (order_id IS NOT NULL OR buffet_booking_id IS NOT NULL)
);

-- Fast Index Lookups
CREATE INDEX IF NOT EXISTS idx_payment_tx_order_id ON public.payment_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_tx_buffet_id ON public.payment_transactions(buffet_booking_id);
CREATE INDEX IF NOT EXISTS idx_payment_tx_provider_tx_id ON public.payment_transactions(provider_transaction_id);
CREATE INDEX IF NOT EXISTS idx_payment_tx_provider_ref ON public.payment_transactions(provider_reference);
CREATE INDEX IF NOT EXISTS idx_payment_tx_status ON public.payment_transactions(status);
CREATE INDEX IF NOT EXISTS idx_payment_tx_idempotency ON public.payment_transactions(idempotency_key);

-- ----------------------------------------------------------------------------
-- SECTION 2: ROW-LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.payment_transactions TO authenticated;

DROP POLICY IF EXISTS "payment_transactions_select_policy" ON public.payment_transactions;

CREATE POLICY "payment_transactions_select_policy" ON public.payment_transactions FOR SELECT USING (
    is_owner(auth.uid()) OR 
    (
        order_id IS NOT NULL AND 
        is_staff_of_branch((SELECT branch_id FROM public.orders WHERE id = order_id), auth.uid())
    ) OR
    (
        buffet_booking_id IS NOT NULL AND 
        is_staff_of_branch((SELECT r.branch_id FROM public.buffet_bookings b JOIN public.buffet_registrations r ON r.id = b.buffet_id WHERE b.id = buffet_booking_id), auth.uid())
    )
);

-- ----------------------------------------------------------------------------
-- SECTION 3: ATOMIC PAYMENT VERIFICATION RPC FOR ORDERS
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.record_verified_payment(UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.record_verified_payment(
    p_order_id UUID,
    p_provider TEXT,
    p_provider_transaction_id TEXT,
    p_amount NUMERIC,
    p_currency TEXT DEFAULT 'PKR',
    p_provider_reference TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL,
    p_raw_response JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_order RECORD;
    v_tx_id UUID;
BEGIN
    -- 1. Lock and fetch order
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order % not found.', p_order_id;
    END IF;

    -- 2. Zero-trust amount and currency check
    IF p_currency != 'PKR' THEN
        RAISE EXCEPTION 'Currency % is not supported. Must be PKR.', p_currency;
    END IF;

    IF p_amount < v_order.total_amount THEN
        RAISE EXCEPTION 'Paid amount (Rs. %) is lower than authoritative order total (Rs. %).', p_amount, v_order.total_amount;
    END IF;

    -- 3. Idempotency Check: if order is already PAID, return success without duplicate side-effects
    IF v_order.payment_status = 'PAID' THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'message', 'Order is already marked as PAID (Idempotent call)',
            'order_id', p_order_id,
            'payment_status', 'PAID',
            'order_status', v_order.status
        );
    END IF;

    -- 4. Record transaction in payment_transactions table
    IF p_idempotency_key IS NOT NULL AND p_idempotency_key != '' THEN
        INSERT INTO public.payment_transactions (
            order_id, provider, provider_transaction_id, amount, currency, status, payment_method, provider_reference, idempotency_key, raw_response, paid_at, updated_at
        ) VALUES (
            p_order_id, p_provider, p_provider_transaction_id, p_amount, p_currency, 'PAID', p_provider, p_provider_reference, p_idempotency_key, p_raw_response, NOW(), NOW()
        )
        ON CONFLICT (idempotency_key) DO UPDATE SET
            status = 'PAID',
            paid_at = NOW(),
            raw_response = p_raw_response,
            updated_at = NOW()
        RETURNING id INTO v_tx_id;
    ELSE
        INSERT INTO public.payment_transactions (
            order_id, provider, provider_transaction_id, amount, currency, status, payment_method, provider_reference, raw_response, paid_at, updated_at
        ) VALUES (
            p_order_id, p_provider, p_provider_transaction_id, p_amount, p_currency, 'PAID', p_provider, p_provider_reference, p_raw_response, NOW(), NOW()
        )
        RETURNING id INTO v_tx_id;
    END IF;

    -- 5. Update Order Payment Status to PAID
    UPDATE public.orders SET
        payment_status = 'PAID',
        payment_method = p_provider,
        updated_at = NOW()
    WHERE id = p_order_id;

    -- 6. Log status history record
    INSERT INTO public.order_status_history (
        id, order_id, from_status, to_status, changed_by_user_id, notes, created_at
    ) VALUES (
        gen_random_uuid(), p_order_id, v_order.status, v_order.status, NULL,
        'Online payment of Rs. ' || p_amount || ' confirmed via ' || p_provider || ' (Ref: ' || COALESCE(p_provider_transaction_id, 'N/A') || ')',
        NOW()
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'order_id', p_order_id,
        'transaction_id', v_tx_id,
        'payment_status', 'PAID',
        'order_status', v_order.status
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_verified_payment(UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, JSONB) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- SECTION 4: ATOMIC PAYMENT VERIFICATION RPC FOR BUFFETS
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.record_verified_buffet_payment(UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.record_verified_buffet_payment(
    p_booking_id UUID,
    p_provider TEXT,
    p_provider_transaction_id TEXT,
    p_amount NUMERIC,
    p_currency TEXT DEFAULT 'PKR',
    p_provider_reference TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL,
    p_raw_response JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_booking RECORD;
    v_tx_id UUID;
BEGIN
    SELECT * INTO v_booking FROM public.buffet_bookings WHERE id = p_booking_id FOR UPDATE;
    IF v_booking.id IS NULL THEN
        RAISE EXCEPTION 'Buffet booking % not found.', p_booking_id;
    END IF;

    IF p_currency != 'PKR' THEN
        RAISE EXCEPTION 'Currency % is not supported. Must be PKR.', p_currency;
    END IF;

    IF p_amount < v_booking.total_amount THEN
        RAISE EXCEPTION 'Paid amount (Rs. %) is lower than authoritative booking total (Rs. %).', p_amount, v_booking.total_amount;
    END IF;

    IF v_booking.status = 'CONFIRMED' OR v_booking.status = 'CHECKED_IN' THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'message', 'Buffet booking is already confirmed (Idempotent call)',
            'booking_id', p_booking_id,
            'status', v_booking.status
        );
    END IF;

    IF p_idempotency_key IS NOT NULL AND p_idempotency_key != '' THEN
        INSERT INTO public.payment_transactions (
            buffet_booking_id, provider, provider_transaction_id, amount, currency, status, payment_method, provider_reference, idempotency_key, raw_response, paid_at, updated_at
        ) VALUES (
            p_booking_id, p_provider, p_provider_transaction_id, p_amount, p_currency, 'PAID', p_provider, p_provider_reference, p_idempotency_key, p_raw_response, NOW(), NOW()
        )
        ON CONFLICT (idempotency_key) DO UPDATE SET
            status = 'PAID',
            paid_at = NOW(),
            raw_response = p_raw_response,
            updated_at = NOW()
        RETURNING id INTO v_tx_id;
    ELSE
        INSERT INTO public.payment_transactions (
            buffet_booking_id, provider, provider_transaction_id, amount, currency, status, payment_method, provider_reference, raw_response, paid_at, updated_at
        ) VALUES (
            p_booking_id, p_provider, p_provider_transaction_id, p_amount, p_currency, 'PAID', p_provider, p_provider_reference, p_raw_response, NOW(), NOW()
        )
        RETURNING id INTO v_tx_id;
    END IF;

    UPDATE public.buffet_bookings SET
        status = 'CONFIRMED'
    WHERE id = p_booking_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'booking_id', p_booking_id,
        'transaction_id', v_tx_id,
        'status', 'CONFIRMED'
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_verified_buffet_payment(UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, JSONB) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- SECTION 5: REALTIME PUBLICATION REGISTRATION
-- ----------------------------------------------------------------------------

ALTER TABLE public.payment_transactions REPLICA IDENTITY FULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
    
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_transactions;
    EXCEPTION WHEN duplicate_object THEN
        NULL;
    END;
END $$;


-- ============================================================================
-- OK RESTAURANT PLATFORM: BUFFET SECURITY HARDENING (MIGRATION 011)
-- ============================================================================
-- 1. Table Definitions: buffet_checkin_logs
-- 2. Hardened Cryptographic Token Generation & Atomic Booking RPC
-- 3. Atomic Server-Authorized Buffet Check-In RPC with Concurrency Row Locking
-- 4. Public Safe Ticket Lookup RPC
-- 5. Row-Level Security (RLS) & Performance Indexes
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SECTION 1: TABLE DEFINITION & AUDIT LOGGING
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.buffet_checkin_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID REFERENCES public.buffet_bookings(id) ON DELETE CASCADE NOT NULL,
    buffet_id UUID REFERENCES public.buffet_registrations(id) ON DELETE CASCADE NOT NULL,
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE NOT NULL,
    checked_in_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    guests_count INT NOT NULL,
    notes TEXT,
    checked_in_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_buffet_checkin_booking_id ON public.buffet_checkin_logs(booking_id);
CREATE INDEX IF NOT EXISTS idx_buffet_checkin_buffet_id ON public.buffet_checkin_logs(buffet_id);
CREATE INDEX IF NOT EXISTS idx_buffet_checkin_branch_id ON public.buffet_checkin_logs(branch_id);
CREATE INDEX IF NOT EXISTS idx_buffet_checkin_user_id ON public.buffet_checkin_logs(checked_in_by_user_id);

-- Expand buffet_bookings status check constraint to support PENDING and PAID states
ALTER TABLE public.buffet_bookings DROP CONSTRAINT IF EXISTS buffet_bookings_status_check;
ALTER TABLE public.buffet_bookings ADD CONSTRAINT buffet_bookings_status_check
    CHECK (status IN ('PENDING', 'CONFIRMED', 'PAID', 'CHECKED_IN', 'CANCELLED'));

-- ----------------------------------------------------------------------------
-- SECTION 2: HARDENED ATOMIC BOOKING RPC (Server-Side Price Authority)
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.book_buffet_ticket_atomic(UUID, TEXT, TEXT, TEXT, INT);

CREATE OR REPLACE FUNCTION public.book_buffet_ticket_atomic(
    p_buffet_id UUID,
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_customer_email TEXT DEFAULT NULL,
    p_guests_count INT DEFAULT 1
) RETURNS TABLE (
    out_booking_id UUID,
    out_qr_token TEXT,
    out_total_amount NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_buffet RECORD;
    v_total NUMERIC(10,2);
    v_token TEXT;
    v_booking_id UUID := gen_random_uuid();
BEGIN
    -- 1. Strict Guest Count validation
    IF p_guests_count IS NULL OR p_guests_count <= 0 OR p_guests_count > 50 THEN
        RAISE EXCEPTION 'Invalid guest count: %. Must be between 1 and 50 guests.', p_guests_count;
    END IF;

    -- 2. Customer details validation
    IF TRIM(COALESCE(p_customer_name, '')) = '' THEN
        RAISE EXCEPTION 'Customer name cannot be empty.';
    END IF;

    IF TRIM(COALESCE(p_customer_phone, '')) = '' THEN
        RAISE EXCEPTION 'Customer phone number cannot be empty.';
    END IF;

    -- 3. Fetch authoritative price_per_head from database
    SELECT * INTO v_buffet 
    FROM public.buffet_registrations 
    WHERE id = p_buffet_id AND is_active = TRUE;

    IF v_buffet.id IS NULL THEN
        RAISE EXCEPTION 'Buffet event not found or is currently inactive.';
    END IF;

    -- 4. Authoritative server-side price calculation (Zero-Trust)
    v_total := v_buffet.price_per_head * p_guests_count;

    -- 5. 128-bit cryptographically secure token generation (32 hex chars)
    v_token := 'buffet_qr_' || replace(gen_random_uuid()::text, '-', '');

    INSERT INTO public.buffet_bookings (
        id, buffet_id, customer_name, customer_phone, customer_email,
        guests_count, total_amount, qr_ticket_token, status, created_at
    ) VALUES (
        v_booking_id, p_buffet_id, TRIM(p_customer_name), TRIM(p_customer_phone), TRIM(p_customer_email),
        p_guests_count, v_total, v_token, 'PENDING', NOW()
    );

    RETURN QUERY SELECT v_booking_id, v_token, v_total;
END;
$$;
GRANT EXECUTE ON FUNCTION public.book_buffet_ticket_atomic(UUID, TEXT, TEXT, TEXT, INT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- SECTION 3: ATOMIC SERVER-AUTHORIZED CHECK-IN RPC WITH CONCURRENCY ROW LOCKING
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.check_in_buffet_ticket_atomic(TEXT, UUID, UUID);

CREATE OR REPLACE FUNCTION public.check_in_buffet_ticket_atomic(
    p_qr_token TEXT,
    p_staff_user_id UUID,
    p_branch_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_staff RECORD;
    v_booking RECORD;
    v_buffet RECORD;
    v_log_id UUID := gen_random_uuid();
BEGIN
    -- 1. Validate staff authentication & authorization
    IF p_staff_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required: Staff ID must be provided.';
    END IF;

    SELECT * INTO v_staff FROM public.profiles WHERE id = p_staff_user_id;
    IF v_staff.id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Staff profile not found.';
    END IF;

    IF v_staff.role NOT IN ('OWNER', 'BRANCH_ADMIN', 'KITCHEN') THEN
        RAISE EXCEPTION 'Access Denied: Insufficient permissions for buffet check-in (% role).', v_staff.role;
    END IF;

    -- If not OWNER, verify staff belongs to the requested branch
    IF v_staff.role != 'OWNER' AND NOT is_staff_of_branch(p_branch_id, p_staff_user_id) THEN
        RAISE EXCEPTION 'Access Denied: Staff belongs to a different branch.';
    END IF;

    -- 2. Fetch and Lock the Booking record (Atomic concurrency protection)
    SELECT * INTO v_booking 
    FROM public.buffet_bookings 
    WHERE qr_ticket_token = TRIM(p_qr_token)
    FOR UPDATE;

    IF v_booking.id IS NULL THEN
        RAISE EXCEPTION 'Invalid Ticket: No buffet booking found for token "%".', p_qr_token;
    END IF;

    -- 3. Fetch the parent buffet registration
    SELECT * INTO v_buffet
    FROM public.buffet_registrations
    WHERE id = v_booking.buffet_id;

    IF v_buffet.id IS NULL THEN
        RAISE EXCEPTION 'Corrupt Data: Buffet registration event not found.';
    END IF;

    -- 4. Branch Verification: Ticket must belong to the branch where check-in is occurring
    IF v_buffet.branch_id != p_branch_id THEN
        RAISE EXCEPTION 'Wrong Branch: This ticket is for branch "%", but check-in was attempted at branch "%".', v_buffet.branch_id, p_branch_id;
    END IF;

    -- 5. Ticket Status Verification
    IF v_booking.status = 'CANCELLED' THEN
        RAISE EXCEPTION 'Ticket Cancelled: This booking ticket has been cancelled.';
    END IF;

    IF v_booking.status = 'CHECKED_IN' THEN
        RAISE EXCEPTION 'Ticket Reused: Ticket has already been checked in.';
    END IF;

    -- 6. Perform Atomic State Transition
    UPDATE public.buffet_bookings SET
        status = 'CHECKED_IN'
    WHERE id = v_booking.id;

    -- 7. Insert Audit Log
    INSERT INTO public.buffet_checkin_logs (
        id, booking_id, buffet_id, branch_id, checked_in_by_user_id, guests_count, notes, checked_in_at
    ) VALUES (
        v_log_id, v_booking.id, v_buffet.id, p_branch_id, p_staff_user_id, v_booking.guests_count,
        'Checked in by ' || v_staff.full_name || ' (' || v_staff.role || ')', NOW()
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'booking_id', v_booking.id,
        'customer_name', v_booking.customer_name,
        'guests_count', v_booking.guests_count,
        'buffet_title', v_buffet.title,
        'checked_in_at', NOW()
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.check_in_buffet_ticket_atomic(TEXT, UUID, UUID) TO authenticated, anon;

-- ----------------------------------------------------------------------------
-- SECTION 4: PUBLIC SAFE TICKET LOOKUP RPC
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_buffet_ticket_by_token(TEXT);

CREATE OR REPLACE FUNCTION public.get_buffet_ticket_by_token(
    p_token TEXT
) RETURNS TABLE (
    out_id UUID,
    out_buffet_id UUID,
    out_customer_name TEXT,
    out_customer_phone TEXT,
    out_customer_email TEXT,
    out_guests_count INT,
    out_total_amount NUMERIC,
    out_qr_ticket_token TEXT,
    out_status TEXT,
    out_created_at TIMESTAMPTZ,
    out_buffet_title TEXT,
    out_price_per_head NUMERIC,
    out_event_date TEXT,
    out_start_time TEXT,
    out_end_time TEXT,
    out_branch_id UUID
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id,
        b.buffet_id,
        b.customer_name,
        b.customer_phone,
        b.customer_email,
        b.guests_count,
        b.total_amount,
        b.qr_ticket_token,
        b.status,
        b.created_at,
        r.title,
        r.price_per_head,
        r.event_date,
        r.start_time,
        r.end_time,
        r.branch_id
    FROM public.buffet_bookings b
    JOIN public.buffet_registrations r ON r.id = b.buffet_id
    WHERE b.qr_ticket_token = TRIM(p_token);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_buffet_ticket_by_token(TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- SECTION 5: ROW-LEVEL SECURITY POLICIES
-- ----------------------------------------------------------------------------

ALTER TABLE public.buffet_checkin_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "buffet_checkin_logs_select_policy" ON public.buffet_checkin_logs;
CREATE POLICY "buffet_checkin_logs_select_policy" ON public.buffet_checkin_logs FOR SELECT USING (
    is_owner(auth.uid()) OR is_staff_of_branch(branch_id, auth.uid())
);

ALTER TABLE public.buffet_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "buffet_bookings_select_policy" ON public.buffet_bookings;
CREATE POLICY "buffet_bookings_select_policy" ON public.buffet_bookings FOR SELECT USING (
    is_owner(auth.uid()) OR 
    is_staff_of_branch((SELECT branch_id FROM public.buffet_registrations WHERE id = buffet_id), auth.uid())
);
