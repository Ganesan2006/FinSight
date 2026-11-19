-- Account reconciliation, reviewed import history, manual exchange rates,
-- and email-backed account recovery for the individual workspace.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS email_verification_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS email_verification_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS password_reset_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auth_token_version INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_users_email_verification_token
  ON public.users(email_verification_token_hash) WHERE email_verification_token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_password_reset_token
  ON public.users(password_reset_token_hash) WHERE password_reset_token_hash IS NOT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS monthly_income_currency TEXT;
UPDATE public.profiles SET monthly_income_currency = currency WHERE monthly_income_currency IS NULL;
ALTER TABLE public.profiles
  ALTER COLUMN monthly_income_currency SET DEFAULT 'INR',
  ALTER COLUMN monthly_income_currency SET NOT NULL;

-- Existing accounts were created by the prior email/password flow. Preserve
-- access for those users; new registrations must verify their email.
UPDATE public.users
SET email_verified_at = COALESCE(email_verified_at, created_at, NOW())
WHERE email_verified_at IS NULL;

CREATE TABLE IF NOT EXISTS public.account_reconciliations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  system_balance NUMERIC(15, 2) NOT NULL,
  actual_balance NUMERIC(15, 2) NOT NULL,
  adjustment NUMERIC(15, 2) NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  reconciled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.account_reconciliations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own account reconciliations" ON public.account_reconciliations;
CREATE POLICY "Users can read own account reconciliations" ON public.account_reconciliations FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_account_reconciliations_user_date
  ON public.account_reconciliations(user_id, reconciled_at DESC);

CREATE OR REPLACE FUNCTION public.reconcile_account_balance(
  p_user_id UUID,
  p_account_id UUID,
  p_actual_balance NUMERIC,
  p_note TEXT DEFAULT ''
)
RETURNS public.account_reconciliations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_account public.accounts;
  result_row public.account_reconciliations;
BEGIN
  IF p_user_id IS NULL OR p_account_id IS NULL OR p_actual_balance IS NULL THEN
    RAISE EXCEPTION 'Enter the actual account balance';
  END IF;
  SELECT * INTO selected_account FROM public.accounts
    WHERE id = p_account_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account was not found'; END IF;

  INSERT INTO public.account_reconciliations
    (user_id, account_id, system_balance, actual_balance, adjustment, note)
  VALUES
    (p_user_id, p_account_id, selected_account.balance, p_actual_balance,
      p_actual_balance - selected_account.balance, LEFT(COALESCE(p_note, ''), 500))
  RETURNING * INTO result_row;
  UPDATE public.accounts SET balance = p_actual_balance, updated_at = NOW()
    WHERE id = p_account_id AND user_id = p_user_id;
  RETURN result_row;
END;
$$;
REVOKE ALL ON FUNCTION public.reconcile_account_balance(UUID, UUID, NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_account_balance(UUID, UUID, NUMERIC, TEXT) TO service_role;

CREATE TABLE IF NOT EXISTS public.exchange_rates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  from_currency TEXT NOT NULL CHECK (from_currency ~ '^[A-Z]{3}$'),
  to_currency TEXT NOT NULL CHECK (to_currency ~ '^[A-Z]{3}$'),
  rate NUMERIC(20, 10) NOT NULL CHECK (rate > 0),
  effective_on DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (from_currency <> to_currency),
  UNIQUE (user_id, from_currency, to_currency, effective_on)
);
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can CRUD own exchange rates" ON public.exchange_rates;
CREATE POLICY "Users can CRUD own exchange rates" ON public.exchange_rates FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_user_pair_date
  ON public.exchange_rates(user_id, from_currency, to_currency, effective_on DESC);

CREATE TABLE IF NOT EXISTS public.import_batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('csv', 'sms')),
  file_name TEXT,
  rows_total INTEGER NOT NULL DEFAULT 0 CHECK (rows_total >= 0),
  imported_count INTEGER NOT NULL DEFAULT 0 CHECK (imported_count >= 0),
  duplicate_count INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_count >= 0),
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  errors JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.import_batches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read own import batches" ON public.import_batches;
CREATE POLICY "Users can read own import batches" ON public.import_batches FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_import_batches_user_date
  ON public.import_batches(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.validate_bill_account_currency()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_account public.accounts;
BEGIN
  IF NEW.account_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO selected_account FROM public.accounts
    WHERE id = NEW.account_id AND user_id = NEW.user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose an account that belongs to this profile'; END IF;
  IF NEW.currency IS DISTINCT FROM selected_account.currency THEN
    RAISE EXCEPTION 'Bill currency must match the linked account currency';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS bills_validate_account_currency ON public.bills;
CREATE TRIGGER bills_validate_account_currency
  BEFORE INSERT OR UPDATE OF user_id, account_id, currency ON public.bills
  FOR EACH ROW EXECUTE FUNCTION public.validate_bill_account_currency();

CREATE OR REPLACE FUNCTION public.commit_csv_transaction_v2(
  p_user_id UUID,
  p_fingerprint TEXT,
  p_account_id UUID,
  p_to_account_id UUID,
  p_amount NUMERIC,
  p_currency TEXT,
  p_to_amount NUMERIC,
  p_to_currency TEXT,
  p_exchange_rate NUMERIC,
  p_type public.transaction_type,
  p_category TEXT,
  p_description TEXT,
  p_note TEXT,
  p_date DATE
)
RETURNS public.transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  source_account public.accounts;
  destination_account public.accounts;
  result_row public.transactions;
  received_amount NUMERIC(15, 4);
BEGIN
  IF p_user_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint !~ '^[0-9a-f]{64}$' OR p_amount IS NULL OR p_amount <= 0
    OR p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' OR p_type IS NULL OR p_date IS NULL THEN
    RAISE EXCEPTION 'Invalid reviewed CSV transaction';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT || ':' || p_fingerprint, 0));
  SELECT * INTO result_row FROM public.transactions
    WHERE user_id = p_user_id AND import_fingerprint = p_fingerprint LIMIT 1;
  IF FOUND THEN RETURN NULL; END IF;

  SELECT * INTO source_account FROM public.accounts
    WHERE id = p_account_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR source_account.currency <> p_currency THEN
    RAISE EXCEPTION 'Choose an account with the same currency as this transaction';
  END IF;
  IF p_type = 'transfer' THEN
    SELECT * INTO destination_account FROM public.accounts
      WHERE id = p_to_account_id AND user_id = p_user_id AND id <> p_account_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Choose a different destination account from this profile'; END IF;
    IF p_to_currency IS DISTINCT FROM destination_account.currency THEN RAISE EXCEPTION 'Destination currency does not match the account'; END IF;
    received_amount := COALESCE(p_to_amount, p_amount);
    IF received_amount <= 0 THEN RAISE EXCEPTION 'Enter a positive amount received'; END IF;
    IF p_to_currency = p_currency THEN
      received_amount := p_amount;
    ELSIF COALESCE(p_exchange_rate, 0) <= 0 THEN
      RAISE EXCEPTION 'Enter a positive exchange rate for this transfer';
    END IF;
  ELSE
    received_amount := NULL;
  END IF;

  INSERT INTO public.transactions
    (user_id, account_id, to_account_id, type, amount, currency, to_amount, to_currency,
     exchange_rate, category, description, note, date, source, import_fingerprint)
  VALUES
    (p_user_id, p_account_id, CASE WHEN p_type = 'transfer' THEN p_to_account_id ELSE NULL END,
     p_type, p_amount, p_currency, received_amount,
     CASE WHEN p_type = 'transfer' THEN p_to_currency ELSE NULL END,
     CASE WHEN p_type = 'transfer' THEN p_exchange_rate ELSE NULL END,
     LEFT(COALESCE(NULLIF(p_category, ''), 'Other'), 100),
     LEFT(COALESCE(p_description, 'CSV transaction'), 200), LEFT(COALESCE(p_note, ''), 1000),
     p_date, 'csv', p_fingerprint)
  RETURNING * INTO result_row;

  IF p_type = 'income' THEN
    UPDATE public.accounts SET balance = balance + p_amount WHERE id = p_account_id AND user_id = p_user_id;
  ELSIF p_type = 'expense' THEN
    UPDATE public.accounts SET balance = balance - p_amount WHERE id = p_account_id AND user_id = p_user_id;
  ELSE
    UPDATE public.accounts SET balance = balance - p_amount WHERE id = p_account_id AND user_id = p_user_id;
    UPDATE public.accounts SET balance = balance + received_amount WHERE id = p_to_account_id AND user_id = p_user_id;
  END IF;
  RETURN result_row;
END;
$$;
REVOKE ALL ON FUNCTION public.commit_csv_transaction_v2(UUID, TEXT, UUID, UUID, NUMERIC, TEXT, NUMERIC, TEXT, NUMERIC, public.transaction_type, TEXT, TEXT, TEXT, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_csv_transaction_v2(UUID, TEXT, UUID, UUID, NUMERIC, TEXT, NUMERIC, TEXT, NUMERIC, public.transaction_type, TEXT, TEXT, TEXT, DATE) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_password_reset(
  p_token_hash TEXT,
  p_password_hash TEXT,
  p_password_salt TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_user UUID;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$'
    OR p_password_hash IS NULL OR p_password_salt IS NULL THEN
    RETURN FALSE;
  END IF;
  UPDATE public.users
  SET password_hash = p_password_hash,
      password_salt = p_password_salt,
      password_reset_token_hash = NULL,
      password_reset_expires_at = NULL,
      auth_token_version = auth_token_version + 1
  WHERE password_reset_token_hash = p_token_hash
    AND password_reset_expires_at > NOW()
  RETURNING id INTO updated_user;
  RETURN updated_user IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_password_reset(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_password_reset(TEXT, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.record_goal_contribution(
  p_user_id UUID,
  p_goal_id UUID,
  p_amount NUMERIC,
  p_date DATE,
  p_note TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_goal public.goals;
  contribution_row public.goal_contributions;
BEGIN
  IF p_user_id IS NULL OR p_goal_id IS NULL OR p_amount IS NULL OR p_amount <= 0 OR p_date IS NULL THEN
    RAISE EXCEPTION 'Enter a valid goal contribution and date';
  END IF;
  SELECT * INTO selected_goal FROM public.goals
    WHERE id = p_goal_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Goal was not found'; END IF;

  INSERT INTO public.goal_contributions (goal_id, user_id, amount, currency, date, note)
  VALUES (p_goal_id, p_user_id, p_amount, selected_goal.currency, p_date, LEFT(COALESCE(p_note, ''), 500))
  RETURNING * INTO contribution_row;
  UPDATE public.goals SET current_amount = current_amount + p_amount, updated_at = NOW()
    WHERE id = p_goal_id AND user_id = p_user_id
  RETURNING * INTO selected_goal;
  RETURN jsonb_build_object('goal', to_jsonb(selected_goal), 'contribution', to_jsonb(contribution_row));
END;
$$;
REVOKE ALL ON FUNCTION public.record_goal_contribution(UUID, UUID, NUMERIC, DATE, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_goal_contribution(UUID, UUID, NUMERIC, DATE, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.record_investment_transaction(
  p_user_id UUID,
  p_investment_id UUID,
  p_type public.investment_tx_type,
  p_amount NUMERIC,
  p_currency TEXT,
  p_date DATE,
  p_note TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_investment public.investments;
  transaction_row public.investment_transactions;
  next_invested NUMERIC(15, 2);
  next_value NUMERIC(15, 2);
BEGIN
  IF p_user_id IS NULL OR p_investment_id IS NULL OR p_type IS NULL OR p_amount IS NULL OR p_amount <= 0
    OR p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$' OR p_date IS NULL THEN
    RAISE EXCEPTION 'Enter a valid investment transaction';
  END IF;
  SELECT * INTO selected_investment FROM public.investments
    WHERE id = p_investment_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Investment was not found'; END IF;
  IF selected_investment.currency <> p_currency THEN RAISE EXCEPTION 'Transaction currency must match the investment currency'; END IF;

  next_invested := selected_investment.invested_amount;
  next_value := selected_investment.current_value;
  IF p_type = 'sell' THEN
    next_invested := GREATEST(0, next_invested - p_amount);
    next_value := GREATEST(0, next_value - p_amount);
  ELSIF p_type IN ('buy', 'sip') THEN
    next_invested := next_invested + p_amount;
    next_value := next_value + p_amount;
  END IF;

  INSERT INTO public.investment_transactions (investment_id, user_id, type, amount, currency, date, note)
  VALUES (p_investment_id, p_user_id, p_type, p_amount, p_currency, p_date, LEFT(COALESCE(p_note, ''), 500))
  RETURNING * INTO transaction_row;
  UPDATE public.investments SET invested_amount = next_invested, current_value = next_value, updated_at = NOW()
    WHERE id = p_investment_id AND user_id = p_user_id
  RETURNING * INTO selected_investment;
  RETURN jsonb_build_object('investment', to_jsonb(selected_investment), 'transaction', to_jsonb(transaction_row));
END;
$$;
REVOKE ALL ON FUNCTION public.record_investment_transaction(UUID, UUID, public.investment_tx_type, NUMERIC, TEXT, DATE, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_investment_transaction(UUID, UUID, public.investment_tx_type, NUMERIC, TEXT, DATE, TEXT) TO service_role;

-- Reviewed SMS imports may create a masked account after user approval. Keep
-- account creation available even when paid checkout is not enabled; do not
-- make the core ledger depend on an unavailable subscription upgrade.
CREATE OR REPLACE FUNCTION public.commit_reviewed_sms_transaction_v3(
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
BEGIN
  IF p_user_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint !~ '^[0-9a-f]{64}$'
    OR p_amount IS NULL OR p_amount <= 0 OR p_currency IS NULL OR p_currency !~ '^[A-Z]{3}$'
    OR p_type IS NULL OR p_type NOT IN ('income', 'expense') OR p_date IS NULL
    OR p_instrument_type IS NULL OR p_instrument_type NOT IN ('bank', 'credit', 'cash') THEN
    RAISE EXCEPTION 'Invalid reviewed SMS transaction';
  END IF;

  IF p_account_id IS NOT NULL THEN
    RETURN public.commit_reviewed_sms_transaction_v2(
      p_user_id, p_fingerprint, p_account_id, p_amount, p_currency, p_type,
      p_category, p_description, p_date, p_institution_name, p_account_mask, p_instrument_type
    );
  END IF;

  account_digits := RIGHT(REGEXP_REPLACE(COALESCE(p_account_mask, ''), '[^0-9]', '', 'g'), 4);
  last_four := CASE WHEN LENGTH(account_digits) = 4 THEN account_digits ELSE NULL END;
  IF last_four IS NULL THEN RAISE EXCEPTION 'Choose an existing account because this SMS has no safe account suffix'; END IF;
  institution := NULLIF(BTRIM(LEFT(COALESCE(p_institution_name, ''), 100)), '');
  account_kind := CASE WHEN p_instrument_type = 'credit' THEN 'credit'::public.account_type
                       WHEN p_instrument_type = 'cash' THEN 'cash'::public.account_type
                       ELSE 'bank'::public.account_type END;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::TEXT || ':' || p_fingerprint, 0));
  SELECT * INTO transaction_row FROM public.transactions
    WHERE user_id = p_user_id AND sms_fingerprint = p_fingerprint LIMIT 1;
  IF FOUND THEN
    SELECT * INTO account_row FROM public.accounts
      WHERE id = transaction_row.account_id AND user_id = p_user_id;
    RETURN jsonb_build_object('duplicate', TRUE, 'transaction', to_jsonb(transaction_row), 'account', to_jsonb(account_row), 'account_created', FALSE);
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
    INSERT INTO public.accounts (user_id, name, type, balance, currency, institution_name, account_mask)
    VALUES (
      p_user_id,
      COALESCE(institution, CASE WHEN account_kind = 'credit' THEN 'Credit card'
                                WHEN account_kind = 'cash' THEN 'Cash account'
                                ELSE 'Bank account' END),
      account_kind, 0, p_currency, institution, last_four
    ) RETURNING * INTO account_row;
  END IF;

  RETURN public.commit_reviewed_sms_transaction_v2(
    p_user_id, p_fingerprint, account_row.id, p_amount, p_currency, p_type,
    p_category, p_description, p_date, p_institution_name, p_account_mask, p_instrument_type
  );
END;
$$;
REVOKE ALL ON FUNCTION public.commit_reviewed_sms_transaction_v3(UUID, TEXT, UUID, NUMERIC, TEXT, public.transaction_type, TEXT, TEXT, DATE, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_reviewed_sms_transaction_v3(UUID, TEXT, UUID, NUMERIC, TEXT, public.transaction_type, TEXT, TEXT, DATE, TEXT, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.skip_bill_occurrence(
  p_user_id UUID,
  p_bill_id UUID,
  p_due_date DATE
)
RETURNS public.bills
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_bill public.bills;
  selected_occurrence public.bill_occurrences;
  paid_amount NUMERIC(15, 4);
  next_date DATE;
  shifted_date DATE;
BEGIN
  SELECT * INTO selected_bill FROM public.bills
    WHERE id = p_bill_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bill was not found'; END IF;
  IF selected_bill.next_due_date <> p_due_date THEN RAISE EXCEPTION 'This bill occurrence changed. Refresh and try again.'; END IF;
  INSERT INTO public.bill_occurrences (bill_id, user_id, due_date, amount, currency)
  VALUES (selected_bill.id, p_user_id, p_due_date, selected_bill.amount, selected_bill.currency)
  ON CONFLICT (bill_id, due_date) DO NOTHING;
  SELECT * INTO selected_occurrence FROM public.bill_occurrences
    WHERE bill_id = selected_bill.id AND due_date = p_due_date FOR UPDATE;
  IF selected_occurrence.status = 'paid' THEN RAISE EXCEPTION 'A paid occurrence cannot be skipped'; END IF;
  SELECT COALESCE(SUM(amount), 0) INTO paid_amount FROM public.bill_payments
    WHERE occurrence_id = selected_occurrence.id;
  IF paid_amount > 0 THEN RAISE EXCEPTION 'A partially paid bill must be completed before skipping'; END IF;
  UPDATE public.bill_occurrences SET status = 'skipped' WHERE id = selected_occurrence.id;

  IF selected_bill.frequency = 'weekly' THEN
    next_date := p_due_date + 7;
  ELSE
    shifted_date := p_due_date + CASE selected_bill.frequency WHEN 'quarterly' THEN INTERVAL '3 months' WHEN 'yearly' THEN INTERVAL '1 year' ELSE INTERVAL '1 month' END;
    next_date := make_date(EXTRACT(YEAR FROM shifted_date)::INTEGER, EXTRACT(MONTH FROM shifted_date)::INTEGER,
      LEAST(COALESCE(selected_bill.anchor_day, EXTRACT(DAY FROM p_due_date)::INTEGER),
        EXTRACT(DAY FROM (date_trunc('month', shifted_date) + INTERVAL '1 month - 1 day'))::INTEGER));
  END IF;
  UPDATE public.bills SET next_due_date = next_date, status = 'upcoming', updated_at = NOW()
    WHERE id = selected_bill.id AND user_id = p_user_id;
  INSERT INTO public.bill_occurrences (bill_id, user_id, due_date, amount, currency)
  VALUES (selected_bill.id, p_user_id, next_date, selected_bill.amount, selected_bill.currency)
  ON CONFLICT (bill_id, due_date) DO NOTHING;
  SELECT * INTO selected_bill FROM public.bills WHERE id = p_bill_id;
  RETURN selected_bill;
END;
$$;
REVOKE ALL ON FUNCTION public.skip_bill_occurrence(UUID, UUID, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.skip_bill_occurrence(UUID, UUID, DATE) TO service_role;
