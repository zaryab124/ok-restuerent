-- ==============================================================================
-- OK RESTAURANT PLATFORM - 013 TABLES AND QR CODE MANAGEMENT
-- ==============================================================================

-- 1. TABLES ROW LEVEL SECURITY & PERMISSIONS
ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tables_all" ON public.tables;
DROP POLICY IF EXISTS "tables_select" ON public.tables;
DROP POLICY IF EXISTS "tables_insert" ON public.tables;
DROP POLICY IF EXISTS "tables_update" ON public.tables;
DROP POLICY IF EXISTS "tables_delete" ON public.tables;

CREATE POLICY "tables_all" ON public.tables FOR ALL USING (true) WITH CHECK (true);
GRANT ALL ON public.tables TO anon, authenticated, service_role;

-- 2. SECURE RPC TO CREATE TABLE
CREATE OR REPLACE FUNCTION public.create_restaurant_table(
    p_branch_id UUID,
    p_table_number TEXT,
    p_qr_code_token TEXT
) RETURNS TABLE (
    id UUID,
    branch_id UUID,
    table_number TEXT,
    qr_code_token TEXT,
    is_active BOOLEAN
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_table_id UUID := gen_random_uuid();
BEGIN
    INSERT INTO public.tables (
        id,
        branch_id,
        table_number,
        qr_code_token,
        is_active,
        created_at,
        updated_at
    ) VALUES (
        v_table_id,
        p_branch_id,
        TRIM(p_table_number),
        p_qr_code_token,
        TRUE,
        NOW(),
        NOW()
    );

    RETURN QUERY
    SELECT t.id, t.branch_id, t.table_number, t.qr_code_token, t.is_active
    FROM public.tables t
    WHERE t.id = v_table_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_restaurant_table(UUID, TEXT, TEXT) TO anon, authenticated, service_role;
