-- Store only account identity metadata needed to match reviewed SMS imports.
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS institution_name TEXT,
  ADD COLUMN IF NOT EXISTS account_mask TEXT;

CREATE INDEX IF NOT EXISTS idx_accounts_sms_identity
  ON public.accounts(user_id, currency, type, account_mask)
  WHERE account_mask IS NOT NULL;

CREATE OR REPLACE FUNCTION public.commit_reviewed_sms_transaction_v2(
  p_user_id UUID,
  p_fingerprint TEXT,
  p_account_id UUID,
  p_amount NUMERIC,
  p_currency TEXT,
  p_type public.transaction_type,
  p_category TEXT,
  p_description TEXT,
  p_date DATE,
  p_institution_name TEXT,
  p_account_mask TEXT,
  p_instrument_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  account_row public.accounts;
  transaction_row public.transactions;
  account_kind public.account_type;
  account_digits TEXT;
  last_four TEXT;
  institution TEXT;
  match_count INTEGER;
  account_count INTEGER;
  account_limit INTEGER;
  plan_name TEXT;
  was_created BOOLEAN := FALSE;
BEGIN
  IF p_user_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint !~ '^[0-9a-f]{64}$'
    OR p_amount IS NULL OR p_amount <= 0 OR p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$'
    OR p_type IS NULL OR p_type NOT IN ('income', 'expense') OR p_date IS NULL
    OR p_instrument_type IS NULL OR p_instrument_type NOT IN ('bank', 'credit', 'cash') THEN
    RAISE EXCEPTION 'Invalid reviewed SMS transaction';
  END IF;

  -- Serialize retries before account resolution so duplicate taps cannot
  -- create a second account or transaction.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT || ':' || p_fingerprint, 0));
  SELECT * INTO transaction_row FROM public.transactions
    WHERE user_id = p_user_id AND sms_fingerprint = p_fingerprint LIMIT 1;
  IF FOUND THEN
    SELECT * INTO account_row FROM public.accounts
      WHERE id = transaction_row.account_id AND user_id = p_user_id;
    RETURN jsonb_build_object('duplicate', TRUE, 'transaction', to_jsonb(transaction_row), 'account', to_jsonb(account_row), 'account_created', FALSE);
  END IF;

  institution := NULLIF(BTRIM(LEFT(COALESCE(p_institution_name, ''), 100)), '');
  account_digits := RIGHT(REGEXP_REPLACE(COALESCE(p_account_mask, ''), '[^0-9]', '', 'g'), 4);
  last_four := CASE WHEN LENGTH(account_digits) = 4 THEN account_digits ELSE NULL END;
  account_kind := CASE WHEN p_instrument_type = 'credit' THEN 'credit'::public.account_type
                       WHEN p_instrument_type = 'cash' THEN 'cash'::public.account_type
                       ELSE 'bank'::public.account_type END;

  IF p_account_id IS NOT NULL THEN
    SELECT * INTO account_row FROM public.accounts
      WHERE id = p_account_id AND user_id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Choose an account that belongs to this profile'; END IF;
    IF account_row.currency <> p_currency THEN RAISE EXCEPTION 'SMS transaction currency must match the selected account'; END IF;
    IF account_row.type <> account_kind THEN RAISE EXCEPTION 'SMS instrument type must match the selected account'; END IF;
    IF last_four IS NOT NULL AND account_row.account_mask IS NOT NULL AND account_row.account_mask <> last_four THEN
      RAISE EXCEPTION 'The SMS account suffix does not match the selected account';
    END IF;
  ELSE
    IF last_four IS NULL THEN
      RAISE EXCEPTION 'Choose an existing account because this SMS has no safe account suffix';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(
      p_user_id::TEXT || ':' || p_currency || ':' || account_kind::TEXT || ':' || last_four, 1));
    SELECT COUNT(*) INTO match_count FROM public.accounts a
      WHERE a.user_id = p_user_id AND a.currency = p_currency AND a.type = account_kind
        AND a.account_mask = last_four
        AND (institution IS NULL OR a.institution_name IS NULL
          OR LOWER(a.institution_name) = LOWER(institution)
          OR POSITION(LOWER(institution) IN LOWER(a.institution_name)) > 0
          OR POSITION(LOWER(a.institution_name) IN LOWER(institution)) > 0);
    IF match_count > 1 THEN RAISE EXCEPTION 'More than one account matches this SMS; choose the account manually'; END IF;
    IF match_count = 1 THEN
      SELECT * INTO account_row FROM public.accounts a
        WHERE a.user_id = p_user_id AND a.currency = p_currency AND a.type = account_kind
          AND a.account_mask = last_four
          AND (institution IS NULL OR a.institution_name IS NULL
            OR LOWER(a.institution_name) = LOWER(institution)
            OR POSITION(LOWER(institution) IN LOWER(a.institution_name)) > 0
            OR POSITION(LOWER(a.institution_name) IN LOWER(institution)) > 0)
        ORDER BY a.created_at LIMIT 1 FOR UPDATE;
    ELSE
      -- Keep SMS-created accounts within the same account limits as manual CRUD.
      PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT || ':account_limit', 2));
      SELECT COUNT(*) INTO account_count FROM public.accounts WHERE user_id = p_user_id;
      SELECT COALESCE((SELECT s.plan FROM public.subscriptions s WHERE s.user_id = p_user_id), 'free') INTO plan_name;
      account_limit := CASE plan_name WHEN 'free' THEN 3 WHEN 'plus' THEN 10 ELSE NULL END;
      IF account_limit IS NOT NULL AND account_count >= account_limit THEN
        RAISE EXCEPTION 'Account limit reached for this plan';
      END IF;
      INSERT INTO public.accounts (user_id, name, type, balance, currency, institution_name, account_mask)
      VALUES (
        p_user_id,
        COALESCE(institution, CASE WHEN account_kind = 'credit' THEN 'Credit card'
                                  WHEN account_kind = 'cash' THEN 'Cash account'
                                  ELSE 'Bank account' END),
        account_kind, 0, p_currency, institution, last_four
      ) RETURNING * INTO account_row;
      was_created := TRUE;
    END IF;
  END IF;

  IF (account_row.account_mask IS NULL AND last_four IS NOT NULL)
    OR (account_row.institution_name IS NULL AND institution IS NOT NULL) THEN
    UPDATE public.accounts SET
      account_mask = COALESCE(account_mask, last_four),
      institution_name = COALESCE(institution_name, institution),
      updated_at = NOW()
    WHERE id = account_row.id AND user_id = p_user_id
    RETURNING * INTO account_row;
  END IF;

  INSERT INTO public.transactions (
    user_id, account_id, type, amount, currency, category, description, note, date, source, sms_fingerprint
  ) VALUES (
    p_user_id, account_row.id, p_type, p_amount, p_currency,
    COALESCE(NULLIF(p_category, ''), 'Other'), COALESCE(NULLIF(p_description, ''), 'SMS transaction'),
    'Reviewed and imported by the user', p_date, 'sms', p_fingerprint
  ) ON CONFLICT (user_id, sms_fingerprint) WHERE sms_fingerprint IS NOT NULL DO NOTHING
  RETURNING * INTO transaction_row;

  IF NOT FOUND THEN
    IF was_created THEN
      DELETE FROM public.accounts WHERE id = account_row.id AND user_id = p_user_id;
      was_created := FALSE;
      account_row := NULL;
    END IF;
    RETURN jsonb_build_object('duplicate', TRUE, 'transaction', NULL, 'account', to_jsonb(account_row), 'account_created', was_created);
  END IF;

  UPDATE public.accounts SET balance = balance + CASE WHEN p_type = 'income' THEN p_amount ELSE -p_amount END,
    updated_at = NOW() WHERE id = account_row.id AND user_id = p_user_id;
  SELECT * INTO account_row FROM public.accounts WHERE id = account_row.id;
  RETURN jsonb_build_object('duplicate', FALSE, 'transaction', to_jsonb(transaction_row), 'account', to_jsonb(account_row), 'account_created', was_created);
END;
$$;

REVOKE ALL ON FUNCTION public.commit_reviewed_sms_transaction_v2(UUID, TEXT, UUID, NUMERIC, TEXT, public.transaction_type, TEXT, TEXT, DATE, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_reviewed_sms_transaction_v2(UUID, TEXT, UUID, NUMERIC, TEXT, public.transaction_type, TEXT, TEXT, DATE, TEXT, TEXT, TEXT) TO service_role;
