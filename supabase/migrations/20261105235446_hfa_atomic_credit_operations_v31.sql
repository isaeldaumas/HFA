-- HFA V31 | Transactional and idempotent credit operations.
-- LOCAL MIGRATION ONLY. DO NOT APPLY TO PRODUCTION WITHOUT STAGING QA.
--
-- Only service_role may execute the SECURITY INVOKER RPC. Customer JWTs,
-- authenticated and anonymous clients cannot debit/credit anyone's balance.
-- Every call locks the tenant row, validates the public user and event tenant,
-- applies balance+event+ledger atomically, and distinguishes a unique attempt
-- (p_operation_id) from the event so legitimate future analyses remain possible.
--
-- Not a replacement for cross-service execution/LLM idempotency.

ALTER TABLE public.credit_transactions
  ADD COLUMN IF NOT EXISTS hfa_operation_id uuid,
  ADD COLUMN IF NOT EXISTS hfa_balance_applied boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS hfa_credit_transactions_operation_kind_uq
  ON public.credit_transactions (tenant_id, hfa_operation_id, type)
  WHERE hfa_operation_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.hfa_apply_credit_operation_v31(
  p_tenant_id uuid,
  p_user_id uuid,
  p_event_id uuid,
  p_operation_id uuid,
  p_action text,
  p_title text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $hfa_credit_v31$
DECLARE
  v_tenant public.tenants%ROWTYPE;
  v_event public.events%ROWTYPE;
  v_debit public.credit_transactions%ROWTYPE;
  v_refund public.credit_transactions%ROWTYPE;
  v_balance_applied boolean := false;
BEGIN
  IF p_tenant_id IS NULL OR p_user_id IS NULL OR p_event_id IS NULL
     OR p_operation_id IS NULL OR p_action IS NULL
     OR p_action NOT IN ('debit', 'refund') THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001', MESSAGE = 'HFA_CREDIT_INVALID_INPUT';
  END IF;

  -- Locks are always taken in the same order. In particular, two requests
  -- consuming the tenant's last credit must not both observe a positive balance.
  SELECT * INTO v_tenant FROM public.tenants
   WHERE id = p_tenant_id AND is_active = true
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'HFA_CREDIT_TENANT_NOT_ACTIVE';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users
     WHERE id = p_user_id AND tenant_id = p_tenant_id AND is_active = true
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'HFA_CREDIT_USER_NOT_AUTHORIZED';
  END IF;

  -- This check prevents a consumed operation UUID being reused with another
  -- actor or event, even when concurrent retries acquire the tenant lock later.
  SELECT * INTO v_debit FROM public.credit_transactions
   WHERE tenant_id = p_tenant_id
     AND hfa_operation_id = p_operation_id
     AND type = 'consumption'::public.credit_transaction_type;

  IF p_action = 'debit' THEN
    IF FOUND THEN
      IF v_debit.user_id <> p_user_id OR
         v_debit.event_id IS DISTINCT FROM p_event_id OR
         v_debit.amount <> -1 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001',
          MESSAGE = 'HFA_CREDIT_OPERATION_CONFLICT';
      END IF;

      SELECT * INTO v_refund FROM public.credit_transactions
       WHERE tenant_id = p_tenant_id
         AND hfa_operation_id = p_operation_id
         AND type = 'refund'::public.credit_transaction_type;
      IF FOUND THEN
        RETURN pg_catalog.jsonb_build_object(
          'state', 'already_refunded', 'idempotent', true,
          'balance', v_tenant.credits_balance, 'operation_id', p_operation_id
        );
      END IF;

      RETURN pg_catalog.jsonb_build_object(
        'state', 'already_applied', 'idempotent', true,
        'balance', v_tenant.credits_balance, 'operation_id', p_operation_id
      );
    END IF;

    SELECT * INTO v_event FROM public.events
     WHERE id = p_event_id AND tenant_id = p_tenant_id
       AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = 'HFA_CREDIT_EVENT_NOT_AUTHORIZED';
    END IF;

    -- Initial analysis of an event is charged at most once while active.
    -- Retrying after a full refund is a NEW attempt UUID, not a duplicate.
    IF v_event.credits_used <> 0 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = 'HFA_CREDIT_EVENT_ALREADY_CHARGED';
    END IF;

    IF v_tenant.plan = 'trial'
       AND v_tenant.trial_expires_at IS NOT NULL
       AND v_tenant.trial_expires_at <= pg_catalog.now() THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001',
        MESSAGE = 'HFA_CREDIT_TRIAL_EXPIRED';
    END IF;

    IF v_tenant.plan <> 'enterprise' THEN
      IF v_tenant.credits_balance < 1 THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001',
          MESSAGE = 'HFA_CREDIT_INSUFFICIENT_BALANCE';
      END IF;
      UPDATE public.tenants
         SET credits_balance = credits_balance - 1
       WHERE id = p_tenant_id;
      v_balance_applied := true;
      v_tenant.credits_balance := v_tenant.credits_balance - 1;
    END IF;

    UPDATE public.events
       SET credits_used = 1
     WHERE id = p_event_id AND tenant_id = p_tenant_id;

    INSERT INTO public.credit_transactions
      (tenant_id, user_id, event_id, type, amount, description,
       hfa_operation_id, hfa_balance_applied)
    VALUES
      (p_tenant_id, p_user_id, p_event_id,
       'consumption'::public.credit_transaction_type, -1,
       'Análise SERA: ' || pg_catalog.left(coalesce(p_title, ''), 200),
       p_operation_id, v_balance_applied);

    RETURN pg_catalog.jsonb_build_object(
      'state', 'applied', 'idempotent', false,
      'balance', v_tenant.credits_balance, 'operation_id', p_operation_id
    );
  END IF;

  -- Refund is only valid for a previously recorded debit of this SAME
  -- attempt, actor and event. Both ledger rows and balance share a TX.
  IF v_debit.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'HFA_CREDIT_REFUND_WITHOUT_DEBIT';
  END IF;

  IF v_debit.user_id <> p_user_id
     OR v_debit.event_id IS DISTINCT FROM p_event_id
     OR v_debit.amount <> -1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'HFA_CREDIT_OPERATION_CONFLICT';
  END IF;

  SELECT * INTO v_refund FROM public.credit_transactions
   WHERE tenant_id = p_tenant_id
     AND hfa_operation_id = p_operation_id
     AND type = 'refund'::public.credit_transaction_type;

  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'state', 'already_refunded', 'idempotent', true,
      'balance', v_tenant.credits_balance, 'operation_id', p_operation_id
    );
  END IF;

  -- Enterprise has an unlimited sentinel (typically -1). Never add a
  -- refunded credit to that sentinel. The ledger records the compensation.
  IF v_debit.hfa_balance_applied AND v_tenant.plan <> 'enterprise' THEN
    UPDATE public.tenants
       SET credits_balance = credits_balance + 1
     WHERE id = p_tenant_id;
    v_balance_applied := true;
    v_tenant.credits_balance := v_tenant.credits_balance + 1;
  END IF;

  UPDATE public.events SET credits_used = 0
   WHERE id = p_event_id AND tenant_id = p_tenant_id AND credits_used = 1;

  INSERT INTO public.credit_transactions
    (tenant_id, user_id, event_id, type, amount, description,
     hfa_operation_id, hfa_balance_applied)
  VALUES
    (p_tenant_id, p_user_id, p_event_id,
     'refund'::public.credit_transaction_type, 1,
     'Estorno: análise não concluída — ' ||
       pg_catalog.left(coalesce(p_title, ''), 200),
     p_operation_id, v_balance_applied);

  RETURN pg_catalog.jsonb_build_object(
    'state', 'refunded', 'idempotent', false,
    'balance', v_tenant.credits_balance, 'operation_id', p_operation_id
  );
END;
$hfa_credit_v31$;

REVOKE ALL ON FUNCTION public.hfa_apply_credit_operation_v31(
  uuid, uuid, uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hfa_apply_credit_operation_v31(
  uuid, uuid, uuid, uuid, text, text
) TO service_role;

COMMENT ON FUNCTION public.hfa_apply_credit_operation_v31(
  uuid, uuid, uuid, uuid, text, text
) IS 'HFA V31 atomic initial-event debit/refund, service_role only; requires validated actor and unique attempt UUID';

NOTIFY pgrst, 'reload schema';
