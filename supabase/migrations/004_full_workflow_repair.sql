-- OK Restaurant Platform Migration 004: Production Architecture & Auth Repair
-- 1. Clean up corrupted auth.users records from manual seed
-- 2. Add sync_staff_profile SECURITY DEFINER RPC
-- 3. Fix handle_new_user trigger
-- 4. Add universal get_order_by_identifier RPC
-- 5. Fix rider_assignments RLS policies
-- 6. Fix orders and branch_users RLS policies

-- 1. Clean up any corrupted auth.users and auth.identities
DO $$
BEGIN
    DELETE FROM auth.identities WHERE user_id IN (
        '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003',
        '20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000004',
        '30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003',
        '40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000004',
        '50000000-0000-0000-0000-000000000001'
    ) OR email IN (
        'owner1@okrestaurant.com', 'owner2@okrestaurant.com', 'owner3@okrestaurant.com',
        'admin.dera@okrestaurant.com', 'admin.sherifalon@okrestaurant.com', 'admin.kotchuta@okrestaurant.com',
        'kitchen.dera@okrestaurant.com', 'kitchen.sherifalon@okrestaurant.com', 'kitchen.kotchuta@okrestaurant.com',
        'rider1.dera@okrestaurant.com', 'rider2.dera@okrestaurant.com', 'rider.sherifalon@okrestaurant.com', 'rider.kotchuta@okrestaurant.com',
        'customer.demo@gmail.com'
    );

    DELETE FROM auth.users WHERE id IN (
        '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003',
        '20000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000004',
        '30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003',
        '40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000004',
        '50000000-0000-0000-0000-000000000001'
    ) OR email IN (
        'owner1@okrestaurant.com', 'owner2@okrestaurant.com', 'owner3@okrestaurant.com',
        'admin.dera@okrestaurant.com', 'admin.sherifalon@okrestaurant.com', 'admin.kotchuta@okrestaurant.com',
        'kitchen.dera@okrestaurant.com', 'kitchen.sherifalon@okrestaurant.com', 'kitchen.kotchuta@okrestaurant.com',
        'rider1.dera@okrestaurant.com', 'rider2.dera@okrestaurant.com', 'rider.sherifalon@okrestaurant.com', 'rider.kotchuta@okrestaurant.com',
        'customer.demo@gmail.com'
    );
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

-- 2. Enhanced handle_new_user Trigger to respect role and branch metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_role TEXT;
    v_full_name TEXT;
    v_phone TEXT;
    v_branch_id TEXT;
BEGIN
    v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'CUSTOMER');
    v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1));
    v_phone := COALESCE(NEW.raw_user_meta_data->>'phone', '');
    v_branch_id := NEW.raw_user_meta_data->>'branch_id';

    IF v_role NOT IN ('OWNER', 'BRANCH_ADMIN', 'KITCHEN', 'RIDER', 'CUSTOMER') THEN
        v_role := 'CUSTOMER';
    END IF;

    INSERT INTO public.profiles (id, email, full_name, phone, role)
    VALUES (
        NEW.id,
        LOWER(NEW.email),
        v_full_name,
        v_phone,
        v_role
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        phone = EXCLUDED.phone,
        role = CASE WHEN EXCLUDED.role != 'CUSTOMER' THEN EXCLUDED.role ELSE profiles.role END,
        updated_at = NOW();

    IF v_branch_id IS NOT NULL AND v_role IN ('BRANCH_ADMIN', 'KITCHEN', 'RIDER') THEN
        BEGIN
            INSERT INTO public.branch_users (user_id, branch_id, role)
            VALUES (NEW.id, v_branch_id::UUID, v_role)
            ON CONFLICT (user_id, branch_id) DO UPDATE SET role = EXCLUDED.role;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Security Definer RPC for Synchronizing Staff Profiles & Branch Assignments
CREATE OR REPLACE FUNCTION public.sync_staff_profile(
    p_role TEXT,
    p_branch_id UUID DEFAULT NULL,
    p_phone TEXT DEFAULT NULL,
    p_full_name TEXT DEFAULT NULL
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_email TEXT;
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

    INSERT INTO public.profiles (id, email, full_name, phone, role)
    VALUES (
        v_uid,
        LOWER(v_email),
        COALESCE(p_full_name, SPLIT_PART(v_email, '@', 1)),
        COALESCE(p_phone, ''),
        p_role
    )
    ON CONFLICT (id) DO UPDATE SET
        role = EXCLUDED.role,
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
GRANT EXECUTE ON FUNCTION public.sync_staff_profile(TEXT, UUID, TEXT, TEXT) TO authenticated, service_role;

-- 4. Universal Tracking & Identifier Resolver RPC
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
    v_is_uuid BOOLEAN := FALSE;
    v_uuid UUID;
BEGIN
    BEGIN
        v_uuid := p_identifier::UUID;
        v_is_uuid := TRUE;
    EXCEPTION WHEN OTHERS THEN
        v_is_uuid := FALSE;
    END;

    RETURN QUERY
    SELECT 
        o.id AS order_id,
        o.order_number,
        o.tracking_token,
        o.branch_id,
        b.name AS branch_name,
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
            'rider_id', ra.rider_id,
            'rider_name', p.full_name,
            'rider_phone', p.phone,
            'assigned_at', ra.assigned_at
        ) FROM public.rider_assignments ra 
          JOIN public.profiles p ON p.id = ra.rider_id 
          WHERE ra.order_id = o.id LIMIT 1) AS rider_info
    FROM public.orders o
    JOIN public.branches b ON b.id = o.branch_id
    WHERE (v_is_uuid AND (o.tracking_token = v_uuid OR o.id = v_uuid))
       OR o.order_number = p_identifier;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_order_by_identifier(TEXT) TO anon, authenticated, service_role;

-- 5. Fix rider_assignments RLS Policies
DROP POLICY IF EXISTS "rider_assignments_select_policy" ON public.rider_assignments;
CREATE POLICY "rider_assignments_select_policy" ON public.rider_assignments FOR SELECT USING (
    rider_id = auth.uid() OR
    is_owner() OR
    EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = rider_assignments.order_id AND (
            o.customer_id = auth.uid() OR
            is_staff_of_branch(o.branch_id)
        )
    )
);

DROP POLICY IF EXISTS "rider_assignments_insert_policy" ON public.rider_assignments;
CREATE POLICY "rider_assignments_insert_policy" ON public.rider_assignments FOR INSERT WITH CHECK (
    rider_id = auth.uid() OR
    is_owner() OR
    EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = rider_assignments.order_id AND is_staff_of_branch(o.branch_id)
    )
);

DROP POLICY IF EXISTS "rider_assignments_update_policy" ON public.rider_assignments;
CREATE POLICY "rider_assignments_update_policy" ON public.rider_assignments FOR UPDATE USING (
    rider_id = auth.uid() OR
    is_owner() OR
    EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = rider_assignments.order_id AND is_staff_of_branch(o.branch_id)
    )
);

-- 6. Fix branch_users RLS Policies so staff can read branch membership
DROP POLICY IF EXISTS "branch_users_select_policy" ON public.branch_users;
CREATE POLICY "branch_users_select_policy" ON public.branch_users FOR SELECT USING (
    user_id = auth.uid() OR is_owner() OR is_staff_of_branch(branch_id)
);

-- 7. Ensure orders_select_policy covers active staff and public tracking
DROP POLICY IF EXISTS "orders_select_policy" ON public.orders;
CREATE POLICY "orders_select_policy" ON public.orders FOR SELECT USING (
    customer_id = auth.uid() OR 
    is_owner() OR 
    is_staff_of_branch(branch_id)
);
