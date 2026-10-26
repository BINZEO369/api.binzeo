BEGIN;

ALTER TABLE public.checkout_sessions
  DROP CONSTRAINT IF EXISTS checkout_sessions_payment_method_check;
ALTER TABLE public.checkout_sessions
  ADD CONSTRAINT checkout_sessions_payment_method_check
  CHECK (payment_method IN ('cod', 'stripe'));

ALTER TABLE public.order_payments
  DROP CONSTRAINT IF EXISTS order_payments_method_check;
ALTER TABLE public.order_payments
  ADD CONSTRAINT order_payments_method_check
  CHECK (method IN ('cod', 'stripe'));

-- New orders use USD without conversion. Keep BDT accepted only so historical
-- rows remain valid while new checkout functions are already writing USD.
ALTER TABLE public.checkout_sessions
  ALTER COLUMN currency SET DEFAULT 'USD';
ALTER TABLE public.checkout_sessions
  DROP CONSTRAINT IF EXISTS checkout_sessions_currency_check;
ALTER TABLE public.checkout_sessions
  ADD CONSTRAINT checkout_sessions_currency_check CHECK (currency IN ('BDT', 'USD'));

ALTER TABLE public.order_payments
  ALTER COLUMN currency SET DEFAULT 'USD';
ALTER TABLE public.order_payments
  DROP CONSTRAINT IF EXISTS order_payments_currency_check;
ALTER TABLE public.order_payments
  ADD CONSTRAINT order_payments_currency_check CHECK (currency IN ('BDT', 'USD'));

DROP FUNCTION IF EXISTS public.confirm_jabiyen_stripe_order_from_central(text, text, uuid);

CREATE OR REPLACE FUNCTION public.confirm_jabiyen_stripe_order_from_central(
  p_order_number text,
  p_expected_email text,
  p_payment_request_id uuid,
  p_expected_amount_minor bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_order_id uuid;
  v_checkout_id uuid;
  v_order_status text;
  v_customer_email text;
  v_delivery_fee_status text;
  v_total_amount numeric(12,2);
  v_method text;
  v_payment_status text;
  v_provider_reference text;
  v_reference text;
BEGIN
  IF p_order_number IS NULL
     OR p_order_number !~ '^JBY-[0-9]{6}-[A-F0-9]{8}$'
     OR p_expected_email IS NULL
     OR p_expected_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     OR p_payment_request_id IS NULL
     OR p_expected_amount_minor IS NULL
     OR p_expected_amount_minor < 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_CONFIRMATION');
  END IF;

  v_reference := 'central_payment_request:' || p_payment_request_id::text;

  SELECT o.id, o.checkout_id, o.status, c.customer_email, c.delivery_fee_status, c.total_amount
    INTO v_order_id, v_checkout_id, v_order_status, v_customer_email, v_delivery_fee_status, v_total_amount
    FROM public.orders AS o
    JOIN public.checkout_sessions AS c ON c.id = o.checkout_id
   WHERE o.order_number = p_order_number
   FOR UPDATE OF o, c;

  IF NOT FOUND OR lower(coalesce(v_customer_email, '')) <> lower(p_expected_email) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ORDER_NOT_FOUND');
  END IF;

  SELECT p.method, p.status, p.provider_reference
    INTO v_method, v_payment_status, v_provider_reference
    FROM public.order_payments AS p
   WHERE p.order_id = v_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PAYMENT_RECORD_NOT_FOUND');
  END IF;

  IF v_method = 'stripe' AND v_payment_status = 'collected' AND v_provider_reference = v_reference
     AND v_order_status NOT IN ('cancelled', 'returned') THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'order_number', p_order_number, 'status', v_order_status);
  END IF;

  IF v_method <> 'cod'
     OR v_payment_status <> 'awaiting_collection'
     OR v_order_status NOT IN ('pending_confirmation', 'confirmed')
     OR v_delivery_fee_status <> 'confirmed'
     OR v_total_amount IS NULL
     OR v_total_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ORDER_NOT_PAYABLE');
  END IF;

  IF v_total_amount <> (p_expected_amount_minor::numeric / 100) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ORDER_AMOUNT_MISMATCH');
  END IF;

  UPDATE public.checkout_sessions
     SET payment_method = 'stripe', currency = 'USD', updated_at = now()
   WHERE id = v_checkout_id;

  UPDATE public.order_payments
     SET method = 'stripe',
         status = 'collected',
         currency = 'USD',
         collected_amount = v_total_amount,
         collected_at = now(),
         provider_reference = v_reference,
         updated_at = now()
   WHERE order_id = v_order_id;

  IF v_order_status = 'pending_confirmation' THEN
    UPDATE public.orders
       SET status = 'confirmed', updated_at = now()
     WHERE id = v_order_id;

    INSERT INTO public.order_status_history (order_id, from_status, to_status, changed_by, note)
    VALUES (
      v_order_id,
      'pending_confirmation',
      'confirmed',
      'central_stripe_webhook',
      'Order confirmed after BINZEO Central verified Stripe payment request ' || p_payment_request_id::text
    );
    v_order_status := 'confirmed';
  END IF;

  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'order_number', p_order_number, 'status', v_order_status);
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_jabiyen_stripe_order_from_central(text, text, uuid, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_jabiyen_stripe_order_from_central(text, text, uuid, bigint) TO service_role;
COMMENT ON FUNCTION public.confirm_jabiyen_stripe_order_from_central(text, text, uuid, bigint) IS 'Atomically confirms a JABIYEN order only when called by the central service role after a signed Stripe webhook verifies the immutable payment request and exact USD amount; stores no card data.';

COMMIT;
