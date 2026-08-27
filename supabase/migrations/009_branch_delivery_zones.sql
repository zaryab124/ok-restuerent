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
