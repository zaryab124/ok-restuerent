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
