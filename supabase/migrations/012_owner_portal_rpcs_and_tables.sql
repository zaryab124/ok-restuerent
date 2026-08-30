-- ==============================================================================
-- OK RESTAURANT PLATFORM - 012 OWNER PORTAL RPCS AND POLICIES
-- ==============================================================================

-- 1. CREATE BRANCH MENU ITEMS TABLE IF NOT EXISTS
CREATE TABLE IF NOT EXISTS public.branch_menu_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
    price NUMERIC(10, 2),
    is_available BOOLEAN DEFAULT true,
    is_visible BOOLEAN DEFAULT true,
    preparation_time INT,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(branch_id, menu_item_id)
);

ALTER TABLE public.branch_menu_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "branch_menu_items_all" ON public.branch_menu_items;
CREATE POLICY "branch_menu_items_all" ON public.branch_menu_items FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.branch_menu_items TO anon, authenticated, service_role;

-- 2. DELIVERY ZONES PERMISSIONS
ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "delivery_zones_all" ON public.delivery_zones;
DROP POLICY IF EXISTS "delivery_zones_select" ON public.delivery_zones;
DROP POLICY IF EXISTS "delivery_zones_modify" ON public.delivery_zones;

CREATE POLICY "delivery_zones_all" ON public.delivery_zones FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.delivery_zones TO anon, authenticated, service_role;

-- 3. RPC: update_branch_menu_item
CREATE OR REPLACE FUNCTION public.update_branch_menu_item(
    p_branch_id UUID,
    p_menu_item_id UUID,
    p_price NUMERIC DEFAULT NULL,
    p_is_available BOOLEAN DEFAULT NULL,
    p_is_visible BOOLEAN DEFAULT NULL,
    p_preparation_time INT DEFAULT NULL,
    p_sort_order INT DEFAULT NULL
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    -- Upsert branch_menu_items
    INSERT INTO public.branch_menu_items (
        branch_id,
        menu_item_id,
        price,
        is_available,
        is_visible,
        preparation_time,
        sort_order,
        updated_at
    ) VALUES (
        p_branch_id,
        p_menu_item_id,
        p_price,
        COALESCE(p_is_available, true),
        COALESCE(p_is_visible, true),
        p_preparation_time,
        COALESCE(p_sort_order, 0),
        NOW()
    )
    ON CONFLICT (branch_id, menu_item_id) DO UPDATE SET
        price = COALESCE(p_price, public.branch_menu_items.price),
        is_available = COALESCE(p_is_available, public.branch_menu_items.is_available),
        is_visible = COALESCE(p_is_visible, public.branch_menu_items.is_visible),
        preparation_time = COALESCE(p_preparation_time, public.branch_menu_items.preparation_time),
        sort_order = COALESCE(p_sort_order, public.branch_menu_items.sort_order),
        updated_at = NOW();

    -- Also sync base menu_items price / availability if updated
    IF p_price IS NOT NULL THEN
        UPDATE public.menu_items SET base_price = p_price WHERE id = p_menu_item_id;
    END IF;
    IF p_is_available IS NOT NULL THEN
        UPDATE public.menu_items SET is_available = p_is_available WHERE id = p_menu_item_id;
    END IF;

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_branch_menu_item(UUID, UUID, NUMERIC, BOOLEAN, BOOLEAN, INT, INT) TO anon, authenticated, service_role;

-- 4. RPC: toggle_branch_item_availability
CREATE OR REPLACE FUNCTION public.toggle_branch_item_availability(
    p_branch_id UUID,
    p_menu_item_id UUID
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_current_status BOOLEAN;
    v_new_status BOOLEAN;
BEGIN
    SELECT is_available INTO v_current_status
    FROM public.branch_menu_items
    WHERE branch_id = p_branch_id AND menu_item_id = p_menu_item_id;

    IF v_current_status IS NULL THEN
        SELECT is_available INTO v_current_status
        FROM public.menu_items
        WHERE id = p_menu_item_id;
        
        v_current_status := COALESCE(v_current_status, true);
    END IF;

    v_new_status := NOT v_current_status;

    INSERT INTO public.branch_menu_items (
        branch_id,
        menu_item_id,
        is_available,
        updated_at
    ) VALUES (
        p_branch_id,
        p_menu_item_id,
        v_new_status,
        NOW()
    )
    ON CONFLICT (branch_id, menu_item_id) DO UPDATE SET
        is_available = v_new_status,
        updated_at = NOW();

    UPDATE public.menu_items
    SET is_available = v_new_status
    WHERE id = p_menu_item_id;

    RETURN v_new_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.toggle_branch_item_availability(UUID, UUID) TO anon, authenticated, service_role;

-- 5. RPC: manage_delivery_zone
CREATE OR REPLACE FUNCTION public.manage_delivery_zone(
    p_branch_id UUID,
    p_name TEXT,
    p_delivery_fee NUMERIC,
    p_minimum_order_amount NUMERIC DEFAULT 0,
    p_estimated_delivery_minutes INT DEFAULT 35,
    p_is_active BOOLEAN DEFAULT true,
    p_sort_order INT DEFAULT 0,
    p_zone_id UUID DEFAULT NULL
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_zone_id UUID := COALESCE(p_zone_id, gen_random_uuid());
BEGIN
    IF p_name IS NULL OR TRIM(p_name) = '' THEN
        RAISE EXCEPTION 'Delivery zone name is required.';
    END IF;
    IF p_delivery_fee IS NULL OR p_delivery_fee < 0 THEN
        RAISE EXCEPTION 'Delivery fee must be non-negative.';
    END IF;

    IF p_zone_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.delivery_zones WHERE id = p_zone_id) THEN
        UPDATE public.delivery_zones
        SET
            name = TRIM(p_name),
            delivery_fee = p_delivery_fee,
            minimum_order_amount = COALESCE(p_minimum_order_amount, 0),
            estimated_delivery_minutes = COALESCE(p_estimated_delivery_minutes, 35),
            is_active = COALESCE(p_is_active, true),
            sort_order = COALESCE(p_sort_order, 0),
            updated_at = NOW()
        WHERE id = p_zone_id;
    ELSE
        INSERT INTO public.delivery_zones (
            id,
            branch_id,
            name,
            delivery_fee,
            minimum_order_amount,
            estimated_delivery_minutes,
            is_active,
            sort_order,
            created_at,
            updated_at
        ) VALUES (
            v_zone_id,
            p_branch_id,
            TRIM(p_name),
            p_delivery_fee,
            COALESCE(p_minimum_order_amount, 0),
            COALESCE(p_estimated_delivery_minutes, 35),
            COALESCE(p_is_active, true),
            COALESCE(p_sort_order, 0),
            NOW(),
            NOW()
        );
    END IF;

    RETURN v_zone_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.manage_delivery_zone(UUID, TEXT, NUMERIC, NUMERIC, INT, BOOLEAN, INT, UUID) TO anon, authenticated, service_role;

-- 6. RPC: delete_delivery_zone
CREATE OR REPLACE FUNCTION public.delete_delivery_zone(
    p_zone_id UUID
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    DELETE FROM public.delivery_zones WHERE id = p_zone_id;
    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_delivery_zone(UUID) TO anon, authenticated, service_role;
