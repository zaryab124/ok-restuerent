-- OK Restaurant Platform Migration 005: Admin Menu Management & Multi-Order Operations

-- 1. Open Modify Policies on Menu Items, Categories, Variants, and Tables
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

-- 2. Batch Order Status Update RPC
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
