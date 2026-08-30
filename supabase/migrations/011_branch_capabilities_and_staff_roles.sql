-- ==============================================================================
-- OK RESTAURANT PLATFORM - 011 BRANCH CAPABILITIES & STAFF ROLES FIX
-- ==============================================================================

-- 1. FIX STAFF & OWNER PROFILES IN PROFILES TABLE
UPDATE public.profiles 
SET role = 'OWNER' 
WHERE email = 'owner@okrestaurant.com';

UPDATE public.profiles 
SET role = 'BRANCH_ADMIN' 
WHERE email LIKE 'admin.%';

UPDATE public.profiles 
SET role = 'KITCHEN' 
WHERE email LIKE 'kitchen.%';

UPDATE public.profiles 
SET role = 'RIDER' 
WHERE email LIKE 'rider%';

-- 2. CREATE SECURITY DEFINER RPC FOR BRANCH CAPABILITY TOGGLES
CREATE OR REPLACE FUNCTION public.update_branch_capability(
    p_branch_id UUID,
    p_dine_in BOOLEAN DEFAULT NULL,
    p_takeaway BOOLEAN DEFAULT NULL,
    p_delivery BOOLEAN DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_updated JSONB;
BEGIN
    -- Check if record exists
    IF EXISTS (SELECT 1 FROM public.branch_capabilities WHERE branch_id = p_branch_id) THEN
        UPDATE public.branch_capabilities
        SET 
            dine_in_enabled = COALESCE(p_dine_in, dine_in_enabled),
            takeaway_enabled = COALESCE(p_takeaway, takeaway_enabled),
            delivery_enabled = COALESCE(p_delivery, delivery_enabled),
            updated_at = NOW()
        WHERE branch_id = p_branch_id;
    ELSE
        INSERT INTO public.branch_capabilities (branch_id, dine_in_enabled, takeaway_enabled, delivery_enabled, updated_at)
        VALUES (
            p_branch_id,
            COALESCE(p_dine_in, TRUE),
            COALESCE(p_takeaway, TRUE),
            COALESCE(p_delivery, TRUE),
            NOW()
        );
    END IF;

    SELECT jsonb_build_object(
        'id', id,
        'branch_id', branch_id,
        'dine_in_enabled', dine_in_enabled,
        'takeaway_enabled', takeaway_enabled,
        'delivery_enabled', delivery_enabled,
        'updated_at', updated_at
    ) INTO v_updated
    FROM public.branch_capabilities
    WHERE branch_id = p_branch_id
    LIMIT 1;

    RETURN v_updated;
END;
$$;

-- 3. PERMISSIONS & RLS POLICIES FOR BRANCH CAPABILITIES
GRANT EXECUTE ON FUNCTION public.update_branch_capability(UUID, BOOLEAN, BOOLEAN, BOOLEAN) TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "branch_capabilities_all" ON public.branch_capabilities;
DROP POLICY IF EXISTS "branch_capabilities_select_policy" ON public.branch_capabilities;
DROP POLICY IF EXISTS "branch_capabilities_update_policy" ON public.branch_capabilities;

CREATE POLICY "branch_capabilities_select_policy" ON public.branch_capabilities FOR SELECT USING (true);
CREATE POLICY "branch_capabilities_update_policy" ON public.branch_capabilities FOR ALL USING (true) WITH CHECK (true);
