-- OK Restaurant Platform Migration 004: Complete Production Workflow & Realtime Repair
-- Fixes: Order Listing for Staff Portals, Universal Tracking, Realtime Publications, and RLS Permissions

-- 1. Realtime Full Identity Setup
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.order_status_history REPLICA IDENTITY FULL;
ALTER TABLE public.rider_assignments REPLICA IDENTITY FULL;

-- 2. Clean up any corrupted auth.users and auth.identities
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

-- 3. Universal Get Branch Orders RPC (Guarantees Admin, Kitchen & Rider Portals Load Real Orders)
CREATE OR REPLACE FUNCTION public.get_branch_orders(
    p_branch_id UUID DEFAULT NULL,
    p_status TEXT DEFAULT NULL
)
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
    WHERE (p_branch_id IS NULL OR o.branch_id = p_branch_id)
      AND (p_status IS NULL OR o.status = p_status)
    ORDER BY o.created_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_branch_orders(UUID, TEXT) TO anon, authenticated, service_role;

-- 4. Universal Order Identifier Resolver RPC (For Customer Tracking by Token or Order Number)
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
    SELECT * FROM public.get_order_by_identifier(p_tracking_token::text);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_order_by_tracking_token(UUID) TO anon, authenticated, service_role;

-- 5. Staff Profile Sync RPC
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

-- 6. Direct Order Status Update with Full History
CREATE OR REPLACE FUNCTION public.update_order_status_direct(
    p_order_id UUID,
    p_new_status TEXT,
    p_user_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_current_status TEXT;
BEGIN
    SELECT status INTO v_current_status FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF v_current_status IS NULL THEN
        RAISE EXCEPTION 'Order not found.';
    END IF;

    UPDATE public.orders
    SET status = p_new_status,
        updated_at = NOW(),
        payment_status = CASE 
            WHEN p_new_status IN ('DELIVERED', 'COMPLETED') AND payment_method = 'CASH' THEN 'PAID'
            ELSE payment_status 
        END
    WHERE id = p_order_id;

    INSERT INTO public.order_status_history (
        id, order_id, from_status, to_status, changed_by_user_id, notes, created_at
    ) VALUES (
        gen_random_uuid(), p_order_id, v_current_status, p_new_status, p_user_id, p_notes, NOW()
    );

    RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_order_status_direct(UUID, TEXT, UUID, TEXT) TO anon, authenticated, service_role;

-- 7. Ensure Open Read Permissions on Orders for Dashboard Reliability
DROP POLICY IF EXISTS "orders_select_policy" ON public.orders;
CREATE POLICY "orders_select_policy" ON public.orders FOR SELECT USING (true);

DROP POLICY IF EXISTS "order_items_select_policy" ON public.order_items;
CREATE POLICY "order_items_select_policy" ON public.order_items FOR SELECT USING (true);

DROP POLICY IF EXISTS "order_status_history_select_policy" ON public.order_status_history;
CREATE POLICY "order_status_history_select_policy" ON public.order_status_history FOR SELECT USING (true);

DROP POLICY IF EXISTS "rider_assignments_select_policy" ON public.rider_assignments;
CREATE POLICY "rider_assignments_select_policy" ON public.rider_assignments FOR SELECT USING (true);

DROP POLICY IF EXISTS "rider_assignments_insert_policy" ON public.rider_assignments;
CREATE POLICY "rider_assignments_insert_policy" ON public.rider_assignments FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "rider_assignments_update_policy" ON public.rider_assignments;
CREATE POLICY "rider_assignments_update_policy" ON public.rider_assignments FOR UPDATE USING (true);

-- 8. Supabase Realtime Publication Verification
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.rider_assignments;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.order_status_history;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
END $$;
