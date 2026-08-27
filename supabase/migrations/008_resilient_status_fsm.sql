-- ==============================================================================
-- OK RESTAURANT PLATFORM - 008 RESILIENT ORDER STATUS FSM & RPC
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.update_order_status_direct(
    p_order_id UUID,
    p_new_status TEXT,
    p_user_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_effective_user_id UUID;
    v_order_branch_id UUID;
    v_current_status TEXT;
    v_order_type TEXT;
    v_payment_method TEXT;
    v_is_valid_transition BOOLEAN := FALSE;
BEGIN
    -- 1. Determine effective user ID with robust fallback
    v_effective_user_id := COALESCE(v_caller_id, p_user_id, '20000000-0000-0000-0000-000000000002'::UUID);

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

    -- 4. Terminal state check
    IF v_current_status IN ('COMPLETED', 'REJECTED', 'CANCELLED') THEN
        RAISE EXCEPTION 'Cannot update order % because it is already in terminal state "%".', p_order_id, v_current_status;
    END IF;

    -- 5. Comprehensive & Resilient Transition Graph
    IF p_new_status = 'CANCELLED' THEN
        v_is_valid_transition := TRUE;
    ELSIF v_current_status = 'PENDING' THEN
        IF p_new_status IN ('CONFIRMED', 'PREPARING', 'REJECTED') THEN
            v_is_valid_transition := TRUE;
        END IF;
    ELSIF v_current_status = 'CONFIRMED' THEN
        IF p_new_status IN ('PREPARING', 'READY', 'COMPLETED') THEN
            v_is_valid_transition := TRUE;
        END IF;
    ELSIF v_current_status = 'PREPARING' THEN
        IF p_new_status IN ('READY', 'OUT_FOR_DELIVERY', 'COMPLETED') THEN
            v_is_valid_transition := TRUE;
        END IF;
    ELSIF v_current_status = 'READY' THEN
        -- Allow rider assignment, direct admin dispatch, or direct completion
        IF p_new_status IN ('ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED') THEN
            v_is_valid_transition := TRUE;
        END IF;
    ELSIF v_current_status = 'ASSIGNED' THEN
        IF p_new_status IN ('PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED') THEN
            v_is_valid_transition := TRUE;
        END IF;
    ELSIF v_current_status = 'PICKED_UP' THEN
        IF p_new_status IN ('OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED') THEN
            v_is_valid_transition := TRUE;
        END IF;
    ELSIF v_current_status = 'OUT_FOR_DELIVERY' THEN
        IF p_new_status IN ('DELIVERED', 'COMPLETED') THEN
            v_is_valid_transition := TRUE;
        END IF;
    ELSIF v_current_status = 'DELIVERED' THEN
        IF p_new_status = 'COMPLETED' THEN
            v_is_valid_transition := TRUE;
        END IF;
    END IF;

    IF NOT v_is_valid_transition THEN
        RAISE EXCEPTION 'Illegal order status transition from % to % for order type %.', v_current_status, p_new_status, v_order_type;
    END IF;

    -- 6. Execute Order Update
    UPDATE public.orders
    SET 
        status = p_new_status,
        payment_status = CASE 
            WHEN p_new_status IN ('DELIVERED', 'COMPLETED') AND payment_method = 'CASH' THEN 'PAID'
            ELSE payment_status
        END,
        updated_at = NOW()
    WHERE id = p_order_id;

    -- 7. Audit status history
    INSERT INTO public.order_status_history (
        order_id,
        status,
        notes,
        created_by
    ) VALUES (
        p_order_id,
        p_new_status,
        COALESCE(p_notes, 'Status updated to ' || p_new_status),
        v_effective_user_id
    );

    RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_order_status_direct(UUID, TEXT, UUID, TEXT) TO anon, authenticated, service_role;
