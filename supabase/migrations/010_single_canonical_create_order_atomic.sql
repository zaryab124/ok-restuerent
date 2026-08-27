-- ==============================================================================
-- OK RESTAURANT PLATFORM - 010 SINGLE CANONICAL CREATE_ORDER_ATOMIC (VERIFIED SCHEMAS)
-- ==============================================================================

-- 1. DROP ALL PREVIOUS OVERLOADS TO ELIMINATE CONFLICT
DROP FUNCTION IF EXISTS public.create_order_atomic(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.create_order_atomic(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, UUID);
DROP FUNCTION IF EXISTS public.create_order_atomic(UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.create_order_atomic(p_branch_id UUID, p_customer_name TEXT, p_customer_phone TEXT, p_order_type TEXT, p_table_id TEXT, p_delivery_address TEXT, p_delivery_notes TEXT, p_payment_method TEXT, p_items JSONB);
DROP FUNCTION IF EXISTS public.create_order_atomic(p_branch_id UUID, p_customer_name TEXT, p_customer_phone TEXT, p_order_type TEXT, p_table_id TEXT, p_delivery_address TEXT, p_delivery_notes TEXT, p_payment_method TEXT, p_items JSONB, p_delivery_zone_id UUID);

-- 2. ENABLE DELIVERY ON ALL BRANCHES
UPDATE public.branch_capabilities 
SET delivery_enabled = TRUE, dine_in_enabled = TRUE, takeaway_enabled = TRUE;

-- 3. INSTALL THE EXACT SCHEMA-MATCHED CANONICAL FUNCTION
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
    v_zone_fee NUMERIC(10,2);
BEGIN
    -- 1. Input Validations
    IF p_customer_name IS NULL OR TRIM(p_customer_name) = '' THEN
        RAISE EXCEPTION 'Customer name is required.';
    END IF;
    IF p_customer_phone IS NULL OR TRIM(p_customer_phone) = '' THEN
        RAISE EXCEPTION 'Customer phone is required.';
    END IF;
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Cannot create an order with an empty items array.';
    END IF;

    -- 2. Verify Branch
    SELECT is_active INTO v_branch_active FROM public.branches WHERE id = p_branch_id;
    IF v_branch_active IS NULL OR NOT v_branch_active THEN
        RAISE EXCEPTION 'Selected branch is invalid or inactive.';
    END IF;

    -- 3. Order Type & Delivery
    IF p_order_type = 'DELIVERY' THEN
        IF p_delivery_address IS NULL OR TRIM(p_delivery_address) = '' THEN
            RAISE EXCEPTION 'Delivery address is required for delivery orders.';
        END IF;

        IF p_delivery_zone_id IS NOT NULL THEN
            SELECT delivery_fee INTO v_zone_fee
            FROM public.delivery_zones 
            WHERE id = p_delivery_zone_id AND branch_id = p_branch_id;

            v_delivery_fee := COALESCE(v_zone_fee, 100.00);
        ELSE
            v_delivery_fee := 100.00;
        END IF;

    ELSIF p_order_type = 'DINE_IN' THEN
        IF p_table_id IS NOT NULL AND TRIM(p_table_id) != '' THEN
            IF p_table_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
                SELECT id INTO v_resolved_table_id 
                FROM public.tables 
                WHERE id = p_table_id::UUID AND branch_id = p_branch_id;
            ELSE
                SELECT id INTO v_resolved_table_id 
                FROM public.tables 
                WHERE table_number = TRIM(p_table_id) AND branch_id = p_branch_id 
                LIMIT 1;
            END IF;
        END IF;
    END IF;

    -- 4. Generate Order Number
    v_order_number := 'OK-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || UPPER(SUBSTRING(gen_random_uuid()::text, 1, 6));

    -- 5. Insert Order Header
    INSERT INTO public.orders (
        id,
        order_number,
        tracking_token,
        branch_id,
        customer_name,
        customer_phone,
        order_type,
        table_id,
        delivery_address,
        delivery_notes,
        subtotal,
        delivery_fee,
        total_amount,
        payment_method,
        payment_status,
        status,
        created_at,
        updated_at
    ) VALUES (
        v_order_id,
        v_order_number,
        v_tracking_token,
        p_branch_id,
        TRIM(p_customer_name),
        TRIM(p_customer_phone),
        p_order_type,
        v_resolved_table_id,
        CASE WHEN p_order_type = 'DELIVERY' THEN TRIM(p_delivery_address) ELSE NULL END,
        TRIM(p_delivery_notes),
        0.00,
        v_delivery_fee,
        0.00,
        COALESCE(p_payment_method, 'CASH'),
        'PENDING',
        'PENDING',
        NOW(),
        NOW()
    );

    -- 6. Insert Order Items
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_menu_item_id := (v_item->>'menu_item_id')::UUID;
        v_variant_id := (v_item->>'variant_id')::UUID;
        v_quantity := COALESCE((v_item->>'quantity')::INT, 1);

        -- Lookup Menu Item
        SELECT name, base_price, is_available 
        INTO v_item_name, v_unit_price, v_is_available
        FROM public.menu_items 
        WHERE id = v_menu_item_id;

        IF v_item_name IS NULL THEN
            RAISE EXCEPTION 'Menu item % does not exist.', v_menu_item_id;
        END IF;

        IF v_is_available IS FALSE THEN
            RAISE EXCEPTION 'Item "%" is currently out of stock.', v_item_name;
        END IF;

        -- Lookup Variant if provided
        IF v_variant_id IS NOT NULL THEN
            SELECT name, price 
            INTO v_variant_name, v_unit_price
            FROM public.menu_item_variants 
            WHERE id = v_variant_id AND menu_item_id = v_menu_item_id;

            IF v_variant_name IS NULL THEN
                RAISE EXCEPTION 'Variant % does not exist for item "%".', v_variant_id, v_item_name;
            END IF;
        ELSE
            v_variant_name := NULL;
        END IF;

        v_item_subtotal := COALESCE(v_unit_price, 0) * v_quantity;
        v_subtotal := v_subtotal + v_item_subtotal;

        INSERT INTO public.order_items (
            order_id,
            menu_item_id,
            variant_id,
            item_name,
            variant_name,
            unit_price,
            quantity,
            subtotal_price,
            special_instructions
        ) VALUES (
            v_order_id,
            v_menu_item_id,
            v_variant_id,
            v_item_name,
            v_variant_name,
            COALESCE(v_unit_price, 0),
            v_quantity,
            v_item_subtotal,
            TRIM(v_item->>'special_instructions')
        );
    END LOOP;

    v_total := v_subtotal + v_delivery_fee;

    -- 7. Update Order Totals
    UPDATE public.orders
    SET 
        subtotal = v_subtotal,
        delivery_fee = v_delivery_fee,
        total_amount = v_total
    WHERE id = v_order_id;

    -- 8. Record Status History with Exact Schema Columns
    INSERT INTO public.order_status_history (
        order_id,
        from_status,
        to_status,
        changed_by_user_id,
        notes
    ) VALUES (
        v_order_id,
        NULL,
        'PENDING',
        v_caller_id,
        'Order placed successfully via Web Portal'
    );

    out_order_id := v_order_id;
    out_order_number := v_order_number;
    out_tracking_token := v_tracking_token;
    out_total_amount := v_total;
    RETURN NEXT;
END;
$$;

-- 4. GRANT EXECUTION PERMISSION
GRANT EXECUTE ON FUNCTION public.create_order_atomic(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, UUID) TO anon, authenticated, service_role;
