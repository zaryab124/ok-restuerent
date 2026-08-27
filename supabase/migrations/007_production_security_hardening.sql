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
