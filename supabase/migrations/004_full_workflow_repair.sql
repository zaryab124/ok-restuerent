-- OK Restaurant Platform Migration 004: Production Architecture & Auth Repair
-- 1. Clean up corrupted auth.users records from manual seed
-- 2. Add sync_staff_profile SECURITY DEFINER RPC
-- 3. Fix handle_new_user trigger
-- 4. Fix rider_assignments RLS policies
-- 5. Fix orders and branch_users RLS policies

-- 1. Clean up any corrupted auth.users and auth.identities
DO 
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
END ;

-- 2. Enhanced handle_new_user Trigger to respect role and branch metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS 
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

    -- Validate role
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

    -- If branch_id was supplied in metadata and user is staff
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
;

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
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS 
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

    -- Upsert profile with elevated security definer permissions
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

    -- Upsert branch assignment if branch_id provided
    IF p_branch_id IS NOT NULL THEN
        INSERT INTO public.branch_users (user_id, branch_id, role)
        VALUES (v_uid, p_branch_id, p_role)
        ON CONFLICT (user_id, branch_id) DO UPDATE SET role = EXCLUDED.role;
    END IF;

    RETURN TRUE;
END;
;
GRANT EXECUTE ON FUNCTION public.sync_staff_profile(TEXT, UUID, TEXT, TEXT) TO authenticated, service_role;

-- 4. Fix rider_assignments RLS Policies
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

-- 5. Fix branch_users RLS Policies so staff can read branch membership
DROP POLICY IF EXISTS "branch_users_select_policy" ON public.branch_users;
CREATE POLICY "branch_users_select_policy" ON public.branch_users FOR SELECT USING (
    user_id = auth.uid() OR is_owner() OR is_staff_of_branch(branch_id)
);

-- 6. Ensure orders_select_policy covers active staff and public tracking
DROP POLICY IF EXISTS "orders_select_policy" ON public.orders;
CREATE POLICY "orders_select_policy" ON public.orders FOR SELECT USING (
    customer_id = auth.uid() OR 
    is_owner() OR 
    is_staff_of_branch(branch_id)
);
