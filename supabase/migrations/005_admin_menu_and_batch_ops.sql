-- OK Restaurant Platform Migration 005: Admin Menu Management & Multi-Order Operations

-- 1. Open Modify Policies on Menu Items, Categories, Variants, Tables, and Buffets
DROP POLICY IF EXISTS "menu_items_modify_policy" ON public.menu_items;
CREATE POLICY "menu_items_modify_policy" ON public.menu_items FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "menu_categories_modify_policy" ON public.menu_categories;
CREATE POLICY "menu_categories_modify_policy" ON public.menu_categories FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "menu_item_variants_modify_policy" ON public.menu_item_variants;
CREATE POLICY "menu_item_variants_modify_policy" ON public.menu_item_variants FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "tables_modify_policy" ON public.tables;
CREATE POLICY "tables_modify_policy" ON public.tables FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "buffet_registrations_modify_policy" ON public.buffet_registrations;
CREATE POLICY "buffet_registrations_modify_policy" ON public.buffet_registrations FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "buffet_bookings_modify_policy" ON public.buffet_bookings;
CREATE POLICY "buffet_bookings_modify_policy" ON public.buffet_bookings FOR ALL USING (true) WITH CHECK (true);

-- 2. Open Policies on Order Status History and Rider Assignments
DROP POLICY IF EXISTS "order_status_history_select_policy" ON public.order_status_history;
CREATE POLICY "order_status_history_select_policy" ON public.order_status_history FOR SELECT USING (true);

DROP POLICY IF EXISTS "order_status_history_insert_policy" ON public.order_status_history;
CREATE POLICY "order_status_history_insert_policy" ON public.order_status_history FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "order_status_history_modify_policy" ON public.order_status_history;
CREATE POLICY "order_status_history_modify_policy" ON public.order_status_history FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "rider_assignments_select_policy" ON public.rider_assignments;
CREATE POLICY "rider_assignments_select_policy" ON public.rider_assignments FOR SELECT USING (true);

DROP POLICY IF EXISTS "rider_assignments_modify_policy" ON public.rider_assignments;
CREATE POLICY "rider_assignments_modify_policy" ON public.rider_assignments FOR ALL USING (true) WITH CHECK (true);

-- 3. Batch Order Status Update RPC
DROP FUNCTION IF EXISTS public.batch_update_order_status(UUID[], TEXT, UUID, TEXT);
CREATE OR REPLACE FUNCTION public.batch_update_order_status(
    p_order_ids UUID[],
    p_new_status TEXT,
    p_user_id UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
) RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_id UUID;
    v_count INT := 0;
BEGIN
    FOREACH v_id IN ARRAY p_order_ids
    LOOP
        BEGIN
            PERFORM public.update_order_status_direct(v_id, p_new_status, p_user_id, p_notes);
            v_count := v_count + 1;
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END LOOP;
    RETURN v_count;
END;
$$;
GRANT EXECUTE ON FUNCTION public.batch_update_order_status(UUID[], TEXT, UUID, TEXT) TO anon, authenticated, service_role;

-- 4. Overwrite claim_delivery_order with SECURITY DEFINER and error resilience
CREATE OR REPLACE FUNCTION public.claim_delivery_order(
    p_order_id UUID,
    p_rider_id UUID
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_current_status TEXT;
BEGIN
    SELECT status INTO v_current_status FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF v_current_status != 'READY' THEN
        RETURN FALSE;
    END IF;

    BEGIN
        INSERT INTO public.rider_assignments (order_id, rider_id, status)
        VALUES (p_order_id, p_rider_id, 'ACCEPTED');
    EXCEPTION WHEN UNIQUE_VIOLATION THEN
        UPDATE public.rider_assignments SET rider_id = p_rider_id, status = 'ACCEPTED' WHERE order_id = p_order_id;
    END;

    UPDATE public.orders SET status = 'ASSIGNED', updated_at = NOW() WHERE id = p_order_id;
    
    BEGIN
        INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by_user_id, notes)
        VALUES (p_order_id, 'READY', 'ASSIGNED', p_rider_id, 'Rider claimed delivery order');
    EXCEPTION WHEN OTHERS THEN
        NULL;
    END;

    RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.claim_delivery_order(UUID, UUID) TO anon, authenticated, service_role;
