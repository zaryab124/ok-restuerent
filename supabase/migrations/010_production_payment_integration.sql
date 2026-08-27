-- ============================================================================
-- OK RESTAURANT PLATFORM: PRODUCTION PAYMENT INTEGRATION (MIGRATION 010)
-- ============================================================================
-- 1. Table Definitions: payment_transactions & indexes
-- 2. Row-Level Security (RLS) Policies
-- 3. Idempotent Atomic Payment Verification RPC for Orders: record_verified_payment
-- 4. Idempotent Atomic Payment Verification RPC for Buffets: record_verified_buffet_payment
-- 5. Realtime Publication Registration
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SECTION 1: TABLE DEFINITIONS
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- Expand orders.payment_method CHECK constraint to support production payment providers
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_method_check 
    CHECK (payment_method IN ('CASH', 'JAZZCASH', 'EASYPAISA', 'CARD', 'ONLINE', 'TEST_PAYMENT', 'SAFEPAY', 'STRIPE'));

CREATE TABLE IF NOT EXISTS public.payment_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    buffet_booking_id UUID REFERENCES public.buffet_bookings(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'SAFEPAY',
    provider_transaction_id TEXT,
    amount NUMERIC(10, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'PKR',
    status TEXT NOT NULL DEFAULT 'INITIATED' CHECK (status IN (
        'PENDING', 'INITIATED', 'AUTHORIZED', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED', 'PARTIALLY_REFUNDED'
    )),
    payment_method TEXT NOT NULL DEFAULT 'SAFEPAY',
    checkout_url TEXT,
    provider_reference TEXT,
    failure_reason TEXT,
    idempotency_key TEXT UNIQUE,
    raw_response JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    paid_at TIMESTAMPTZ DEFAULT NULL,
    CONSTRAINT chk_target_exists CHECK (order_id IS NOT NULL OR buffet_booking_id IS NOT NULL)
);

-- Fast Index Lookups
CREATE INDEX IF NOT EXISTS idx_payment_tx_order_id ON public.payment_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_tx_buffet_id ON public.payment_transactions(buffet_booking_id);
CREATE INDEX IF NOT EXISTS idx_payment_tx_provider_tx_id ON public.payment_transactions(provider_transaction_id);
CREATE INDEX IF NOT EXISTS idx_payment_tx_provider_ref ON public.payment_transactions(provider_reference);
CREATE INDEX IF NOT EXISTS idx_payment_tx_status ON public.payment_transactions(status);
CREATE INDEX IF NOT EXISTS idx_payment_tx_idempotency ON public.payment_transactions(idempotency_key);

-- ----------------------------------------------------------------------------
-- SECTION 2: ROW-LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------------------------------

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.payment_transactions TO authenticated;

DROP POLICY IF EXISTS "payment_transactions_select_policy" ON public.payment_transactions;

CREATE POLICY "payment_transactions_select_policy" ON public.payment_transactions FOR SELECT USING (
    is_owner(auth.uid()) OR 
    (
        order_id IS NOT NULL AND 
        is_staff_of_branch((SELECT branch_id FROM public.orders WHERE id = order_id), auth.uid())
    ) OR
    (
        buffet_booking_id IS NOT NULL AND 
        is_staff_of_branch((SELECT r.branch_id FROM public.buffet_bookings b JOIN public.buffet_registrations r ON r.id = b.buffet_id WHERE b.id = buffet_booking_id), auth.uid())
    )
);

-- ----------------------------------------------------------------------------
-- SECTION 3: ATOMIC PAYMENT VERIFICATION RPC FOR ORDERS
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.record_verified_payment(UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.record_verified_payment(
    p_order_id UUID,
    p_provider TEXT,
    p_provider_transaction_id TEXT,
    p_amount NUMERIC,
    p_currency TEXT DEFAULT 'PKR',
    p_provider_reference TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL,
    p_raw_response JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_order RECORD;
    v_tx_id UUID;
BEGIN
    -- 1. Lock and fetch order
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF v_order.id IS NULL THEN
        RAISE EXCEPTION 'Order % not found.', p_order_id;
    END IF;

    -- 2. Zero-trust amount and currency check
    IF p_currency != 'PKR' THEN
        RAISE EXCEPTION 'Currency % is not supported. Must be PKR.', p_currency;
    END IF;

    IF p_amount < v_order.total_amount THEN
        RAISE EXCEPTION 'Paid amount (Rs. %) is lower than authoritative order total (Rs. %).', p_amount, v_order.total_amount;
    END IF;

    -- 3. Idempotency Check: if order is already PAID, return success without duplicate side-effects
    IF v_order.payment_status = 'PAID' THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'message', 'Order is already marked as PAID (Idempotent call)',
            'order_id', p_order_id,
            'payment_status', 'PAID',
            'order_status', v_order.status
        );
    END IF;

    -- 4. Record transaction in payment_transactions table
    IF p_idempotency_key IS NOT NULL AND p_idempotency_key != '' THEN
        INSERT INTO public.payment_transactions (
            order_id, provider, provider_transaction_id, amount, currency, status, payment_method, provider_reference, idempotency_key, raw_response, paid_at, updated_at
        ) VALUES (
            p_order_id, p_provider, p_provider_transaction_id, p_amount, p_currency, 'PAID', p_provider, p_provider_reference, p_idempotency_key, p_raw_response, NOW(), NOW()
        )
        ON CONFLICT (idempotency_key) DO UPDATE SET
            status = 'PAID',
            paid_at = NOW(),
            raw_response = p_raw_response,
            updated_at = NOW()
        RETURNING id INTO v_tx_id;
    ELSE
        INSERT INTO public.payment_transactions (
            order_id, provider, provider_transaction_id, amount, currency, status, payment_method, provider_reference, raw_response, paid_at, updated_at
        ) VALUES (
            p_order_id, p_provider, p_provider_transaction_id, p_amount, p_currency, 'PAID', p_provider, p_provider_reference, p_raw_response, NOW(), NOW()
        )
        RETURNING id INTO v_tx_id;
    END IF;

    -- 5. Update Order Payment Status to PAID
    UPDATE public.orders SET
        payment_status = 'PAID',
        payment_method = p_provider,
        updated_at = NOW()
    WHERE id = p_order_id;

    -- 6. Log status history record
    INSERT INTO public.order_status_history (
        id, order_id, from_status, to_status, changed_by_user_id, notes, created_at
    ) VALUES (
        gen_random_uuid(), p_order_id, v_order.status, v_order.status, NULL,
        'Online payment of Rs. ' || p_amount || ' confirmed via ' || p_provider || ' (Ref: ' || COALESCE(p_provider_transaction_id, 'N/A') || ')',
        NOW()
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'order_id', p_order_id,
        'transaction_id', v_tx_id,
        'payment_status', 'PAID',
        'order_status', v_order.status
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_verified_payment(UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, JSONB) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- SECTION 4: ATOMIC PAYMENT VERIFICATION RPC FOR BUFFETS
-- ----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.record_verified_buffet_payment(UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, JSONB);

CREATE OR REPLACE FUNCTION public.record_verified_buffet_payment(
    p_booking_id UUID,
    p_provider TEXT,
    p_provider_transaction_id TEXT,
    p_amount NUMERIC,
    p_currency TEXT DEFAULT 'PKR',
    p_provider_reference TEXT DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL,
    p_raw_response JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_booking RECORD;
    v_tx_id UUID;
BEGIN
    SELECT * INTO v_booking FROM public.buffet_bookings WHERE id = p_booking_id FOR UPDATE;
    IF v_booking.id IS NULL THEN
        RAISE EXCEPTION 'Buffet booking % not found.', p_booking_id;
    END IF;

    IF p_currency != 'PKR' THEN
        RAISE EXCEPTION 'Currency % is not supported. Must be PKR.', p_currency;
    END IF;

    IF p_amount < v_booking.total_amount THEN
        RAISE EXCEPTION 'Paid amount (Rs. %) is lower than authoritative booking total (Rs. %).', p_amount, v_booking.total_amount;
    END IF;

    IF v_booking.status = 'CONFIRMED' OR v_booking.status = 'CHECKED_IN' THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'message', 'Buffet booking is already confirmed (Idempotent call)',
            'booking_id', p_booking_id,
            'status', v_booking.status
        );
    END IF;

    IF p_idempotency_key IS NOT NULL AND p_idempotency_key != '' THEN
        INSERT INTO public.payment_transactions (
            buffet_booking_id, provider, provider_transaction_id, amount, currency, status, payment_method, provider_reference, idempotency_key, raw_response, paid_at, updated_at
        ) VALUES (
            p_booking_id, p_provider, p_provider_transaction_id, p_amount, p_currency, 'PAID', p_provider, p_provider_reference, p_idempotency_key, p_raw_response, NOW(), NOW()
        )
        ON CONFLICT (idempotency_key) DO UPDATE SET
            status = 'PAID',
            paid_at = NOW(),
            raw_response = p_raw_response,
            updated_at = NOW()
        RETURNING id INTO v_tx_id;
    ELSE
        INSERT INTO public.payment_transactions (
            buffet_booking_id, provider, provider_transaction_id, amount, currency, status, payment_method, provider_reference, raw_response, paid_at, updated_at
        ) VALUES (
            p_booking_id, p_provider, p_provider_transaction_id, p_amount, p_currency, 'PAID', p_provider, p_provider_reference, p_raw_response, NOW(), NOW()
        )
        RETURNING id INTO v_tx_id;
    END IF;

    UPDATE public.buffet_bookings SET
        status = 'CONFIRMED'
    WHERE id = p_booking_id;

    RETURN jsonb_build_object(
        'success', TRUE,
        'booking_id', p_booking_id,
        'transaction_id', v_tx_id,
        'status', 'CONFIRMED'
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_verified_buffet_payment(UUID, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, JSONB) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- SECTION 5: REALTIME PUBLICATION REGISTRATION
-- ----------------------------------------------------------------------------

ALTER TABLE public.payment_transactions REPLICA IDENTITY FULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
    
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.payment_transactions;
    EXCEPTION WHEN duplicate_object THEN
        NULL;
    END;
END $$;
