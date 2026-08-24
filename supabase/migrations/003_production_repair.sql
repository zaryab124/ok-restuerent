-- OK Restaurant Platform Migration 003: Production Workflow Repair
-- Authoritative State Machine, Realtime Publication, Strict RLS & Branch Security
-- Idempotent, Safe (No DROP CASCADE, Preserves get_user_role)

-- 1. Ensure Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Ensure Schema Columns & Constraints
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

-- 3. Security Definer Helpers
CREATE OR REPLACE FUNCTION public.get_user_role(p_user_id UUID DEFAULT auth.uid())
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT role FROM public.profiles WHERE id = p_user_id;
$$;

CREATE OR REPLACE FUNCTION public.is_owner(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id AND role = 'OWNER');
$$;

CREATE OR REPLACE FUNCTION public.is_staff_of_branch(p_branch_id UUID, p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.branch_users WHERE user_id = p_user_id AND branch_id = p_branch_id
    ) OR EXISTS (
        SELECT 1 FROM public.profiles WHERE id = p_user_id AND role = 'OWNER'
    );
$$;

CREATE OR REPLACE FUNCTION public.is_rider(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles WHERE id = p_user_id AND (role = 'RIDER' OR role = 'OWNER')
    );
$$;

-- 4. Authoritative State Machine RPC: update_order_status_secure
CREATE OR REPLACE FUNCTION public.update_order_status_secure(
    p_order_id UUID,
    p_new_status TEXT,
    p_notes TEXT DEFAULT NULL
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_user_role TEXT;
    v_order_branch_id UUID;
    v_current_status TEXT;
    v_order_type TEXT;
    v_is_assigned_rider BOOLEAN := FALSE;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to update order status.';
    END IF;

    SELECT role INTO v_user_role FROM public.profiles WHERE id = v_caller_id;
    IF v_user_role IS NULL THEN
        RAISE EXCEPTION 'User profile not found.';
    END IF;

    SELECT branch_id, status, order_type INTO v_order_branch_id, v_current_status, v_order_type
    FROM public.orders WHERE id = p_order_id FOR UPDATE;

    IF v_order_branch_id IS NULL THEN
        RAISE EXCEPTION 'Order not found.';
    END IF;

    -- Check if rider is assigned to this order
    IF v_user_role = 'RIDER' THEN
        SELECT EXISTS (
            SELECT 1 FROM public.rider_assignments 
            WHERE order_id = p_order_id AND rider_id = v_caller_id
        ) INTO v_is_assigned_rider;
    END IF;

    -- Check branch authorization
    IF v_user_role != 'OWNER' THEN
        IF NOT is_staff_of_branch(v_order_branch_id, v_caller_id) THEN
            RAISE EXCEPTION 'Access Denied: You do not have permission for this branch.';
        END IF;
    END IF;

    -- State Machine Transitions
    -- 1. PENDING -> CONFIRMED (BRANCH_ADMIN, OWNER)
    IF v_current_status = 'PENDING' AND p_new_status = 'CONFIRMED' THEN
        IF v_user_role NOT IN ('BRANCH_ADMIN', 'OWNER') THEN
            RAISE EXCEPTION 'Only Branch Admin or Owner can approve pending orders.';
        END IF;

    -- 2. PENDING -> REJECTED (BRANCH_ADMIN, OWNER)
    ELSIF v_current_status = 'PENDING' AND p_new_status = 'REJECTED' THEN
        IF v_user_role NOT IN ('BRANCH_ADMIN', 'OWNER') THEN
            RAISE EXCEPTION 'Only Branch Admin or Owner can reject pending orders.';
        END IF;

    -- 3. Any Cancellable State -> CANCELLED (BRANCH_ADMIN, OWNER)
    ELSIF p_new_status = 'CANCELLED' THEN
        IF v_current_status IN ('DELIVERED', 'COMPLETED', 'REJECTED', 'CANCELLED') THEN
            RAISE EXCEPTION 'Cannot cancel an order that is already %.', v_current_status;
        END IF;
        IF v_user_role NOT IN ('BRANCH_ADMIN', 'OWNER') THEN
            RAISE EXCEPTION 'Only Branch Admin or Owner can cancel orders.';
        END IF;

    -- 4. CONFIRMED -> PREPARING (KITCHEN, BRANCH_ADMIN, OWNER)
    ELSIF v_current_status = 'CONFIRMED' AND p_new_status = 'PREPARING' THEN
        IF v_user_role NOT IN ('KITCHEN', 'BRANCH_ADMIN', 'OWNER') THEN
            RAISE EXCEPTION 'Only Kitchen staff or Admin can start preparing orders.';
        END IF;

    -- 5. PREPARING -> READY (KITCHEN, BRANCH_ADMIN, OWNER)
    ELSIF v_current_status = 'PREPARING' AND p_new_status = 'READY' THEN
        IF v_user_role NOT IN ('KITCHEN', 'BRANCH_ADMIN', 'OWNER') THEN
            RAISE EXCEPTION 'Only Kitchen staff or Admin can mark orders ready.';
        END IF;

    -- 6. READY -> COMPLETED (For DINE_IN or TAKEAWAY orders only)
    ELSIF v_current_status = 'READY' AND p_new_status = 'COMPLETED' THEN
        IF v_order_type = 'DELIVERY' THEN
            RAISE EXCEPTION 'Delivery orders cannot jump from READY directly to COMPLETED. They must be claimed and delivered by a rider.';
        END IF;
        IF v_user_role NOT IN ('BRANCH_ADMIN', 'KITCHEN', 'OWNER') THEN
            RAISE EXCEPTION 'Only Staff or Owner can complete dine-in/takeaway orders.';
        END IF;

    -- 7. ASSIGNED -> PICKED_UP (Assigned RIDER, OWNER)
    ELSIF v_current_status = 'ASSIGNED' AND p_new_status = 'PICKED_UP' THEN
        IF v_user_role != 'OWNER' AND NOT v_is_assigned_rider THEN
            RAISE EXCEPTION 'Only the assigned rider can pick up this delivery.';
        END IF;

    -- 8. PICKED_UP -> OUT_FOR_DELIVERY (Assigned RIDER, OWNER)
    ELSIF v_current_status = 'PICKED_UP' AND p_new_status = 'OUT_FOR_DELIVERY' THEN
        IF v_user_role != 'OWNER' AND NOT v_is_assigned_rider THEN
            RAISE EXCEPTION 'Only the assigned rider can start delivery.';
        END IF;

    -- 9. OUT_FOR_DELIVERY -> DELIVERED (Assigned RIDER, OWNER)
    ELSIF v_current_status = 'OUT_FOR_DELIVERY' AND p_new_status = 'DELIVERED' THEN
        IF v_user_role != 'OWNER' AND NOT v_is_assigned_rider THEN
            RAISE EXCEPTION 'Only the assigned rider can mark this order delivered.';
        END IF;

    -- 10. DELIVERED -> COMPLETED (BRANCH_ADMIN, OWNER)
    ELSIF v_current_status = 'DELIVERED' AND p_new_status = 'COMPLETED' THEN
        IF v_user_role NOT IN ('BRANCH_ADMIN', 'OWNER') THEN
            RAISE EXCEPTION 'Only Branch Admin or Owner can mark delivered orders completed.';
        END IF;

    ELSE
        RAISE EXCEPTION 'Invalid order state transition from "%" to "%" for % order by role "%".', 
            v_current_status, p_new_status, v_order_type, v_user_role;
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
        gen_random_uuid(), p_order_id, v_current_status, p_new_status, v_caller_id, p_notes, NOW()
    );

    RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_order_status_secure(UUID, TEXT, TEXT) TO authenticated, service_role;

-- 5. Concurrency-Safe Rider Order Claiming RPC: claim_delivery_order
CREATE OR REPLACE FUNCTION public.claim_delivery_order(
    p_order_id UUID,
    p_rider_id UUID
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_user_role TEXT;
    v_order_branch_id UUID;
    v_current_status TEXT;
    v_order_type TEXT;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to claim delivery order.';
    END IF;

    IF v_caller_id != p_rider_id AND NOT is_owner(v_caller_id) THEN
        RAISE EXCEPTION 'You cannot claim orders on behalf of another rider.';
    END IF;

    SELECT role INTO v_user_role FROM public.profiles WHERE id = p_rider_id;
    IF v_user_role NOT IN ('RIDER', 'OWNER') THEN
        RAISE EXCEPTION 'User does not have RIDER role.';
    END IF;

    SELECT branch_id, status, order_type INTO v_order_branch_id, v_current_status, v_order_type
    FROM public.orders WHERE id = p_order_id FOR UPDATE;

    IF v_order_branch_id IS NULL THEN
        RAISE EXCEPTION 'Order not found.';
    END IF;

    IF v_order_type != 'DELIVERY' THEN
        RAISE EXCEPTION 'Only DELIVERY orders can be claimed by riders.';
    END IF;

    IF v_current_status != 'READY' THEN
        RAISE EXCEPTION 'Order cannot be claimed because status is "%" (must be "READY").', v_current_status;
    END IF;

    IF NOT is_staff_of_branch(v_order_branch_id, p_rider_id) AND NOT is_owner(p_rider_id) THEN
        RAISE EXCEPTION 'Rider is not assigned to the order branch.';
    END IF;

    IF EXISTS (SELECT 1 FROM public.rider_assignments WHERE order_id = p_order_id) THEN
        RAISE EXCEPTION 'Order has already been claimed by another rider.';
    END IF;

    INSERT INTO public.rider_assignments (id, order_id, rider_id, status, assigned_at)
    VALUES (gen_random_uuid(), p_order_id, p_rider_id, 'ACCEPTED', NOW());

    UPDATE public.orders 
    SET status = 'ASSIGNED', updated_at = NOW() 
    WHERE id = p_order_id;

    INSERT INTO public.order_status_history (
        id, order_id, from_status, to_status, changed_by_user_id, notes, created_at
    ) VALUES (
        gen_random_uuid(), p_order_id, 'READY', 'ASSIGNED', p_rider_id, 'Delivery order claimed by rider', NOW()
    );

    RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.claim_delivery_order(UUID, UUID) TO authenticated, service_role;

-- 6. Secure Tracking RPC: get_order_by_tracking_token
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
    WHERE o.tracking_token = p_tracking_token;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_order_by_tracking_token(UUID) TO anon, authenticated, service_role;

-- 7. Row Level Security Policies
DROP POLICY IF EXISTS "orders_select_policy" ON public.orders;
CREATE POLICY "orders_select_policy" ON public.orders FOR SELECT USING (
    customer_id = auth.uid() OR 
    is_owner() OR 
    is_staff_of_branch(branch_id)
);

DROP POLICY IF EXISTS "orders_update_policy" ON public.orders;
CREATE POLICY "orders_update_policy" ON public.orders FOR UPDATE USING (
    is_owner() OR 
    is_staff_of_branch(branch_id)
);

DROP POLICY IF EXISTS "order_items_select_policy" ON public.order_items;
CREATE POLICY "order_items_select_policy" ON public.order_items FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = order_items.order_id AND (
            o.customer_id = auth.uid() OR
            is_owner() OR
            is_staff_of_branch(o.branch_id)
        )
    )
);

DROP POLICY IF EXISTS "order_status_history_select_policy" ON public.order_status_history;
CREATE POLICY "order_status_history_select_policy" ON public.order_status_history FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = order_status_history.order_id AND (
            o.customer_id = auth.uid() OR
            is_owner() OR
            is_staff_of_branch(o.branch_id)
        )
    )
);

DROP POLICY IF EXISTS "rider_assignments_select_policy" ON public.rider_assignments;
CREATE POLICY "rider_assignments_select_policy" ON public.rider_assignments FOR SELECT USING (
    rider_id = auth.uid() OR
    is_owner() OR
    EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = rider_assignments.order_id AND is_staff_of_branch(o.branch_id)
    )
);

-- 8. Enable Supabase Realtime for Workflow Tables
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
