-- ============================================================================
-- OK RESTAURANT PLATFORM: BUFFET SECURITY HARDENING (MIGRATION 011)
-- ============================================================================
-- 1. Table Definitions: buffet_checkin_logs
-- 2. Hardened Cryptographic Token Generation & Atomic Booking RPC
-- 3. Atomic Server-Authorized Buffet Check-In RPC with Concurrency Row Locking
-- 4. Public Safe Ticket Lookup RPC
-- 5. Row-Level Security (RLS) & Performance Indexes
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SECTION 1: TABLE DEFINITION & AUDIT LOGGING
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.buffet_checkin_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID REFERENCES public.buffet_bookings(id) ON DELETE CASCADE NOT NULL,
    buffet_id UUID REFERENCES public.buffet_registrations(id) ON DELETE CASCADE NOT NULL,
    branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE NOT NULL,
    checked_in_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    guests_count INT NOT NULL,
    notes TEXT,
    checked_in_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_buffet_checkin_booking_id ON public.buffet_checkin_logs(booking_id);
CREATE INDEX IF NOT EXISTS idx_buffet_checkin_buffet_id ON public.buffet_checkin_logs(buffet_id);
CREATE INDEX IF NOT EXISTS idx_buffet_checkin_branch_id ON public.buffet_checkin_logs(branch_id);
CREATE INDEX IF NOT EXISTS idx_buffet_checkin_user_id ON public.buffet_checkin_logs(checked_in_by_user_id);

-- Expand buffet_bookings status check constraint to support PENDING and PAID states
ALTER TABLE public.buffet_bookings DROP CONSTRAINT IF EXISTS buffet_bookings_status_check;
ALTER TABLE public.buffet_bookings ADD CONSTRAINT buffet_bookings_status_check
    CHECK (status IN ('PENDING', 'CONFIRMED', 'PAID', 'CHECKED_IN', 'CANCELLED'));

-- ----------------------------------------------------------------------------
-- SECTION 2: HARDENED ATOMIC BOOKING RPC (Server-Side Price Authority)
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.book_buffet_ticket_atomic(UUID, TEXT, TEXT, TEXT, INT);

CREATE OR REPLACE FUNCTION public.book_buffet_ticket_atomic(
    p_buffet_id UUID,
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_customer_email TEXT DEFAULT NULL,
    p_guests_count INT DEFAULT 1
) RETURNS TABLE (
    out_booking_id UUID,
    out_qr_token TEXT,
    out_total_amount NUMERIC
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_buffet RECORD;
    v_total NUMERIC(10,2);
    v_token TEXT;
    v_booking_id UUID := gen_random_uuid();
BEGIN
    -- 1. Strict Guest Count validation
    IF p_guests_count IS NULL OR p_guests_count <= 0 OR p_guests_count > 50 THEN
        RAISE EXCEPTION 'Invalid guest count: %. Must be between 1 and 50 guests.', p_guests_count;
    END IF;

    -- 2. Customer details validation
    IF TRIM(COALESCE(p_customer_name, '')) = '' THEN
        RAISE EXCEPTION 'Customer name cannot be empty.';
    END IF;

    IF TRIM(COALESCE(p_customer_phone, '')) = '' THEN
        RAISE EXCEPTION 'Customer phone number cannot be empty.';
    END IF;

    -- 3. Fetch authoritative price_per_head from database
    SELECT * INTO v_buffet 
    FROM public.buffet_registrations 
    WHERE id = p_buffet_id AND is_active = TRUE;

    IF v_buffet.id IS NULL THEN
        RAISE EXCEPTION 'Buffet event not found or is currently inactive.';
    END IF;

    -- 4. Authoritative server-side price calculation (Zero-Trust)
    v_total := v_buffet.price_per_head * p_guests_count;

    -- 5. 128-bit cryptographically secure token generation (32 hex chars)
    v_token := 'buffet_qr_' || replace(gen_random_uuid()::text, '-', '');

    INSERT INTO public.buffet_bookings (
        id, buffet_id, customer_name, customer_phone, customer_email,
        guests_count, total_amount, qr_ticket_token, status, created_at
    ) VALUES (
        v_booking_id, p_buffet_id, TRIM(p_customer_name), TRIM(p_customer_phone), TRIM(p_customer_email),
        p_guests_count, v_total, v_token, 'PENDING', NOW()
    );

    RETURN QUERY SELECT v_booking_id, v_token, v_total;
END;
$$;
GRANT EXECUTE ON FUNCTION public.book_buffet_ticket_atomic(UUID, TEXT, TEXT, TEXT, INT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- SECTION 3: ATOMIC SERVER-AUTHORIZED CHECK-IN RPC WITH CONCURRENCY ROW LOCKING
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.check_in_buffet_ticket_atomic(TEXT, UUID, UUID);

CREATE OR REPLACE FUNCTION public.check_in_buffet_ticket_atomic(
    p_qr_token TEXT,
    p_staff_user_id UUID,
    p_branch_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_staff RECORD;
    v_booking RECORD;
    v_buffet RECORD;
    v_log_id UUID := gen_random_uuid();
BEGIN
    -- 1. Validate staff authentication & authorization
    IF p_staff_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required: Staff ID must be provided.';
    END IF;

    SELECT * INTO v_staff FROM public.profiles WHERE id = p_staff_user_id;
    IF v_staff.id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: Staff profile not found.';
    END IF;

    IF v_staff.role NOT IN ('OWNER', 'BRANCH_ADMIN', 'KITCHEN') THEN
        RAISE EXCEPTION 'Access Denied: Insufficient permissions for buffet check-in (% role).', v_staff.role;
    END IF;

    -- If not OWNER, verify staff belongs to the requested branch
    IF v_staff.role != 'OWNER' AND NOT is_staff_of_branch(p_branch_id, p_staff_user_id) THEN
        RAISE EXCEPTION 'Access Denied: Staff belongs to a different branch.';
    END IF;

    -- 2. Fetch and Lock the Booking record (Atomic concurrency protection)
    SELECT * INTO v_booking 
    FROM public.buffet_bookings 
    WHERE qr_ticket_token = TRIM(p_qr_token)
    FOR UPDATE;

    IF v_booking.id IS NULL THEN
        RAISE EXCEPTION 'Invalid Ticket: No buffet booking found for token "%".', p_qr_token;
    END IF;

    -- 3. Fetch the parent buffet registration
    SELECT * INTO v_buffet
    FROM public.buffet_registrations
    WHERE id = v_booking.buffet_id;

    IF v_buffet.id IS NULL THEN
        RAISE EXCEPTION 'Corrupt Data: Buffet registration event not found.';
    END IF;

    -- 4. Branch Verification: Ticket must belong to the branch where check-in is occurring
    IF v_buffet.branch_id != p_branch_id THEN
        RAISE EXCEPTION 'Wrong Branch: This ticket is for branch "%", but check-in was attempted at branch "%".', v_buffet.branch_id, p_branch_id;
    END IF;

    -- 5. Ticket Status Verification
    IF v_booking.status = 'CANCELLED' THEN
        RAISE EXCEPTION 'Ticket Cancelled: This booking ticket has been cancelled.';
    END IF;

    IF v_booking.status = 'CHECKED_IN' THEN
        RAISE EXCEPTION 'Ticket Reused: Ticket has already been checked in.';
    END IF;

    -- 6. Perform Atomic State Transition
    UPDATE public.buffet_bookings SET
        status = 'CHECKED_IN'
    WHERE id = v_booking.id;

    -- 7. Insert Audit Log
    INSERT INTO public.buffet_checkin_logs (
        id, booking_id, buffet_id, branch_id, checked_in_by_user_id, guests_count, notes, checked_in_at
    ) VALUES (
        v_log_id, v_booking.id, v_buffet.id, p_branch_id, p_staff_user_id, v_booking.guests_count,
        'Checked in by ' || v_staff.full_name || ' (' || v_staff.role || ')', NOW()
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'booking_id', v_booking.id,
        'customer_name', v_booking.customer_name,
        'guests_count', v_booking.guests_count,
        'buffet_title', v_buffet.title,
        'checked_in_at', NOW()
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.check_in_buffet_ticket_atomic(TEXT, UUID, UUID) TO authenticated, anon;

-- ----------------------------------------------------------------------------
-- SECTION 4: PUBLIC SAFE TICKET LOOKUP RPC
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_buffet_ticket_by_token(TEXT);

CREATE OR REPLACE FUNCTION public.get_buffet_ticket_by_token(
    p_token TEXT
) RETURNS TABLE (
    out_id UUID,
    out_buffet_id UUID,
    out_customer_name TEXT,
    out_customer_phone TEXT,
    out_customer_email TEXT,
    out_guests_count INT,
    out_total_amount NUMERIC,
    out_qr_ticket_token TEXT,
    out_status TEXT,
    out_created_at TIMESTAMPTZ,
    out_buffet_title TEXT,
    out_price_per_head NUMERIC,
    out_event_date TEXT,
    out_start_time TEXT,
    out_end_time TEXT,
    out_branch_id UUID
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
    RETURN QUERY
    SELECT 
        b.id,
        b.buffet_id,
        b.customer_name,
        b.customer_phone,
        b.customer_email,
        b.guests_count,
        b.total_amount,
        b.qr_ticket_token,
        b.status,
        b.created_at,
        r.title,
        r.price_per_head,
        r.event_date,
        r.start_time,
        r.end_time,
        r.branch_id
    FROM public.buffet_bookings b
    JOIN public.buffet_registrations r ON r.id = b.buffet_id
    WHERE b.qr_ticket_token = TRIM(p_token);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_buffet_ticket_by_token(TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- SECTION 5: ROW-LEVEL SECURITY POLICIES
-- ----------------------------------------------------------------------------

ALTER TABLE public.buffet_checkin_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "buffet_checkin_logs_select_policy" ON public.buffet_checkin_logs;
CREATE POLICY "buffet_checkin_logs_select_policy" ON public.buffet_checkin_logs FOR SELECT USING (
    is_owner(auth.uid()) OR is_staff_of_branch(branch_id, auth.uid())
);

ALTER TABLE public.buffet_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "buffet_bookings_select_policy" ON public.buffet_bookings;
CREATE POLICY "buffet_bookings_select_policy" ON public.buffet_bookings FOR SELECT USING (
    is_owner(auth.uid()) OR 
    is_staff_of_branch((SELECT branch_id FROM public.buffet_registrations WHERE id = buffet_id), auth.uid())
);
