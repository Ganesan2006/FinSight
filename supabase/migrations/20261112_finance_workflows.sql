-- Multi-currency ledger, period budgets, recurring bill occurrences, and deletion grace period.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_scheduled_at TIMESTAMPTZ;

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR';

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS to_amount NUMERIC(15, 4),
  ADD COLUMN IF NOT EXISTS to_currency TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(20, 10),
  ADD COLUMN IF NOT EXISTS import_fingerprint TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_import_fingerprint
  ON public.transactions(user_id, import_fingerprint) WHERE import_fingerprint IS NOT NULL;

UPDATE public.transactions t SET currency = COALESCE(a.currency, 'INR')
FROM public.accounts a WHERE a.id = t.account_id;
UPDATE public.transactions t SET
  to_currency = COALESCE(destination.currency, source.currency, 'INR'),
  to_amount = COALESCE(t.to_amount, t.amount)
FROM public.accounts source, public.accounts destination
WHERE t.type = 'transfer' AND source.id = t.account_id AND destination.id = t.to_account_id;

ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS anchor_day SMALLINT,
  ADD COLUMN IF NOT EXISTS anchor_month SMALLINT;

ALTER TABLE public.dues ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE public.due_payments ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE public.investments ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE public.investment_transactions ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR';
ALTER TABLE public.goal_contributions ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR';

UPDATE public.bills b
SET currency = COALESCE(a.currency, 'INR'),
    anchor_day = COALESCE(b.anchor_day, EXTRACT(DAY FROM b.next_due_date)::SMALLINT),
    anchor_month = COALESCE(b.anchor_month, EXTRACT(MONTH FROM b.next_due_date)::SMALLINT)
FROM public.accounts a
WHERE b.account_id = a.id;
UPDATE public.due_payments p SET currency = d.currency FROM public.dues d WHERE d.id = p.due_id;
UPDATE public.investment_transactions tx SET currency = i.currency FROM public.investments i WHERE i.id = tx.investment_id;
UPDATE public.goal_contributions c SET currency = g.currency FROM public.goals g WHERE g.id = c.goal_id;
UPDATE public.bills SET
  anchor_day = COALESCE(anchor_day, EXTRACT(DAY FROM next_due_date)::SMALLINT),
  anchor_month = COALESCE(anchor_month, EXTRACT(MONTH FROM next_due_date)::SMALLINT)
WHERE anchor_day IS NULL OR anchor_month IS NULL;

CREATE TABLE IF NOT EXISTS public.budgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  period_start DATE NOT NULL,
  amount NUMERIC(15, 4) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  rollover_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  carry_in NUMERIC(15, 4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, category, period_start, currency)
);
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can CRUD own budgets" ON public.budgets;
CREATE POLICY "Users can CRUD own budgets" ON public.budgets FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_budgets_user_period ON public.budgets(user_id, period_start);

CREATE TABLE IF NOT EXISTS public.bill_occurrences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  due_date DATE NOT NULL,
  amount NUMERIC(15, 4) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'paid', 'skipped')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bill_id, due_date)
);
ALTER TABLE public.bill_occurrences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can CRUD own bill occurrences" ON public.bill_occurrences;
CREATE POLICY "Users can CRUD own bill occurrences" ON public.bill_occurrences FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_bill_occurrences_user_due ON public.bill_occurrences(user_id, due_date);

INSERT INTO public.bill_occurrences (bill_id, user_id, due_date, amount, currency, status)
SELECT id, user_id, next_due_date, amount, currency, CASE WHEN status = 'paid' THEN 'paid' ELSE 'upcoming' END
FROM public.bills
ON CONFLICT (bill_id, due_date) DO NOTHING;

ALTER TABLE public.bill_payments
  ADD COLUMN IF NOT EXISTS occurrence_id UUID REFERENCES public.bill_occurrences(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bill_payments_idempotency
  ON public.bill_payments(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
UPDATE public.bill_payments p SET currency = b.currency FROM public.bills b WHERE b.id = p.bill_id;

CREATE OR REPLACE FUNCTION public.record_bill_payment(
  p_user_id UUID,
  p_bill_id UUID,
  p_due_date DATE,
  p_amount NUMERIC,
  p_paid_on DATE,
  p_create_expense BOOLEAN,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  selected_bill public.bills;
  selected_occurrence public.bill_occurrences;
  payment_row public.bill_payments;
  transaction_row public.transactions;
  amount_paid NUMERIC(15,4);
  next_date DATE;
BEGIN
  IF p_user_id IS NULL OR p_due_date IS NULL OR p_amount IS NULL OR p_amount <= 0 OR p_paid_on IS NULL THEN
    RAISE EXCEPTION 'Enter a valid payment amount and date';
  END IF;
  SELECT * INTO selected_bill FROM public.bills
   WHERE id = p_bill_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bill was not found'; END IF;
  IF p_due_date <> selected_bill.next_due_date THEN RAISE EXCEPTION 'This bill occurrence has changed. Refresh and try again.'; END IF;

  INSERT INTO public.bill_occurrences (bill_id, user_id, due_date, amount, currency)
  VALUES (selected_bill.id, p_user_id, selected_bill.next_due_date, selected_bill.amount, selected_bill.currency)
  ON CONFLICT (bill_id, due_date) DO NOTHING;
  SELECT * INTO selected_occurrence FROM public.bill_occurrences
   WHERE bill_id = selected_bill.id AND due_date = p_due_date FOR UPDATE;
  IF selected_occurrence.status = 'paid' THEN RAISE EXCEPTION 'This bill occurrence is already paid'; END IF;

  IF p_idempotency_key IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.bill_payments WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key
  ) THEN
    RETURN jsonb_build_object('duplicate', TRUE, 'bill', to_jsonb(selected_bill));
  END IF;
  SELECT COALESCE(SUM(amount), 0) INTO amount_paid
    FROM public.bill_payments WHERE occurrence_id = selected_occurrence.id;
  IF p_amount > selected_occurrence.amount - amount_paid THEN
    RAISE EXCEPTION 'Payment exceeds the remaining bill amount';
  END IF;

  INSERT INTO public.bill_payments (bill_id, user_id, occurrence_id, amount, currency, date, idempotency_key)
  VALUES (selected_bill.id, p_user_id, selected_occurrence.id, p_amount, selected_occurrence.currency, p_paid_on, p_idempotency_key)
  RETURNING * INTO payment_row;

  IF selected_bill.account_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = selected_bill.account_id AND user_id = p_user_id) THEN
      RAISE EXCEPTION 'Payment account was not found';
    END IF;
    UPDATE public.accounts SET balance = balance - p_amount WHERE id = selected_bill.account_id AND user_id = p_user_id;
  END IF;

  IF p_create_expense AND selected_bill.account_id IS NOT NULL THEN
    INSERT INTO public.transactions (user_id, account_id, type, amount, currency, category, description, date, source)
    VALUES (p_user_id, selected_bill.account_id, 'expense', p_amount, selected_occurrence.currency,
      COALESCE(selected_bill.category, 'Bills'), selected_bill.name, p_paid_on, 'bill_payment')
    RETURNING * INTO transaction_row;
    UPDATE public.bill_payments SET transaction_id = transaction_row.id WHERE id = payment_row.id;
  END IF;

  IF amount_paid + p_amount >= selected_occurrence.amount THEN
    UPDATE public.bill_occurrences SET status = 'paid' WHERE id = selected_occurrence.id;
    IF selected_bill.frequency = 'weekly' THEN
      next_date := selected_occurrence.due_date + 7;
    ELSE
      next_date := make_date(
        EXTRACT(YEAR FROM (selected_occurrence.due_date + CASE selected_bill.frequency WHEN 'quarterly' THEN INTERVAL '3 months' WHEN 'yearly' THEN INTERVAL '1 year' ELSE INTERVAL '1 month' END))::INTEGER,
        EXTRACT(MONTH FROM (selected_occurrence.due_date + CASE selected_bill.frequency WHEN 'quarterly' THEN INTERVAL '3 months' WHEN 'yearly' THEN INTERVAL '1 year' ELSE INTERVAL '1 month' END))::INTEGER,
        LEAST(
          COALESCE(selected_bill.anchor_day, EXTRACT(DAY FROM selected_occurrence.due_date)::INTEGER),
          EXTRACT(DAY FROM (date_trunc('month', selected_occurrence.due_date + CASE selected_bill.frequency WHEN 'quarterly' THEN INTERVAL '3 months' WHEN 'yearly' THEN INTERVAL '1 year' ELSE INTERVAL '1 month' END) + INTERVAL '1 month - 1 day'))::INTEGER
        )
      );
    END IF;
    UPDATE public.bills SET next_due_date = next_date, status = 'upcoming', updated_at = NOW()
      WHERE id = selected_bill.id;
    INSERT INTO public.bill_occurrences (bill_id, user_id, due_date, amount, currency)
    VALUES (selected_bill.id, p_user_id, next_date, selected_bill.amount, selected_bill.currency)
    ON CONFLICT (bill_id, due_date) DO NOTHING;
  END IF;
  SELECT * INTO selected_bill FROM public.bills WHERE id = p_bill_id;
  RETURN jsonb_build_object('duplicate', FALSE, 'payment', to_jsonb(payment_row), 'transaction', to_jsonb(transaction_row), 'bill', to_jsonb(selected_bill));
END;
$$;

REVOKE ALL ON FUNCTION public.record_bill_payment(UUID, UUID, DATE, NUMERIC, DATE, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_bill_payment(UUID, UUID, DATE, NUMERIC, DATE, BOOLEAN, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.commit_reviewed_sms_transaction(
  p_user_id UUID,
  p_fingerprint TEXT,
  p_account_id UUID,
  p_amount NUMERIC,
  p_currency TEXT,
  p_type public.transaction_type,
  p_category TEXT,
  p_description TEXT,
  p_date DATE
)
RETURNS public.transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  account_row public.accounts;
  transaction_row public.transactions;
BEGIN
  IF p_user_id IS NULL OR p_fingerprint !~ '^[0-9a-f]{64}$' OR p_amount IS NULL OR p_amount <= 0
    OR p_currency !~ '^[A-Z]{3}$' OR p_type NOT IN ('income', 'expense') OR p_date IS NULL THEN
    RAISE EXCEPTION 'Invalid reviewed SMS transaction';
  END IF;
  SELECT * INTO account_row FROM public.accounts
    WHERE id = p_account_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose an account that belongs to this profile'; END IF;
  IF account_row.currency <> p_currency THEN RAISE EXCEPTION 'SMS transaction currency must match the selected account'; END IF;

  INSERT INTO public.transactions (
    user_id, account_id, type, amount, currency, category, description, note, date, source, sms_fingerprint
  ) VALUES (
    p_user_id, p_account_id, p_type, p_amount, p_currency,
    COALESCE(NULLIF(p_category, ''), 'Other'), COALESCE(NULLIF(p_description, ''), 'SMS transaction'),
    'Reviewed and imported by the user', p_date, 'sms', p_fingerprint
  ) ON CONFLICT (user_id, sms_fingerprint) WHERE sms_fingerprint IS NOT NULL DO NOTHING
  RETURNING * INTO transaction_row;

  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE public.accounts SET balance = balance + CASE WHEN p_type = 'income' THEN p_amount ELSE -p_amount END,
    updated_at = NOW() WHERE id = account_row.id AND user_id = p_user_id;
  RETURN transaction_row;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_reviewed_sms_transaction(UUID, TEXT, UUID, NUMERIC, TEXT, public.transaction_type, TEXT, TEXT, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_reviewed_sms_transaction(UUID, TEXT, UUID, NUMERIC, TEXT, public.transaction_type, TEXT, TEXT, DATE) TO service_role;

CREATE OR REPLACE FUNCTION public.commit_csv_transaction(
  p_user_id UUID,
  p_fingerprint TEXT,
  p_account_id UUID,
  p_amount NUMERIC,
  p_currency TEXT,
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
  account_row public.accounts;
  transaction_row public.transactions;
BEGIN
  IF p_user_id IS NULL OR p_fingerprint !~ '^[0-9a-f]{64}$' OR p_amount IS NULL OR p_amount <= 0
    OR p_currency !~ '^[A-Z]{3}$' OR p_type NOT IN ('income', 'expense') OR p_date IS NULL THEN
    RAISE EXCEPTION 'Invalid CSV transaction';
  END IF;
  SELECT * INTO account_row FROM public.accounts
    WHERE id = p_account_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose an account that belongs to this profile'; END IF;
  IF account_row.currency <> p_currency THEN RAISE EXCEPTION 'CSV transaction currency must match the selected account'; END IF;

  INSERT INTO public.transactions (
    user_id, account_id, type, amount, currency, category, description, note, date, source, import_fingerprint
  ) VALUES (
    p_user_id, p_account_id, p_type, p_amount, p_currency,
    COALESCE(NULLIF(p_category, ''), 'Other'), COALESCE(NULLIF(p_description, ''), 'CSV transaction'),
    COALESCE(p_note, ''), p_date, 'csv', p_fingerprint
  ) ON CONFLICT (user_id, import_fingerprint) WHERE import_fingerprint IS NOT NULL DO NOTHING
  RETURNING * INTO transaction_row;

  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE public.accounts SET balance = balance + CASE WHEN p_type = 'income' THEN p_amount ELSE -p_amount END,
    updated_at = NOW() WHERE id = account_row.id AND user_id = p_user_id;
  RETURN transaction_row;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_csv_transaction(UUID, TEXT, UUID, NUMERIC, TEXT, public.transaction_type, TEXT, TEXT, TEXT, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_csv_transaction(UUID, TEXT, UUID, NUMERIC, TEXT, public.transaction_type, TEXT, TEXT, TEXT, DATE) TO service_role;

CREATE OR REPLACE FUNCTION public.mutate_financial_transaction(
  p_user_id UUID,
  p_transaction_id UUID,
  p_action TEXT,
  p_row JSONB DEFAULT NULL
)
RETURNS public.transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_row public.transactions;
  result_row public.transactions;
  source_account public.accounts;
  destination_account public.accounts;
  source_id UUID;
  destination_id UUID;
  amount_value NUMERIC(15,4);
  destination_amount NUMERIC(15,4);
  currency_value TEXT;
  destination_currency TEXT;
  kind_value public.transaction_type;
BEGIN
  IF p_user_id IS NULL OR p_action NOT IN ('create', 'update', 'delete') THEN
    RAISE EXCEPTION 'Invalid transaction operation';
  END IF;
  IF p_action IN ('update', 'delete') THEN
    SELECT * INTO old_row FROM public.transactions
      WHERE id = p_transaction_id AND user_id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Transaction was not found'; END IF;
    IF old_row.type = 'income' THEN
      UPDATE public.accounts SET balance = balance - old_row.amount WHERE id = old_row.account_id AND user_id = p_user_id;
    ELSIF old_row.type = 'expense' THEN
      UPDATE public.accounts SET balance = balance + old_row.amount WHERE id = old_row.account_id AND user_id = p_user_id;
    ELSE
      UPDATE public.accounts SET balance = balance + old_row.amount WHERE id = old_row.account_id AND user_id = p_user_id;
      IF old_row.to_account_id IS NOT NULL THEN
        UPDATE public.accounts SET balance = balance - COALESCE(old_row.to_amount, old_row.amount) WHERE id = old_row.to_account_id AND user_id = p_user_id;
      END IF;
    END IF;
    IF p_action = 'delete' THEN
      DELETE FROM public.transactions WHERE id = old_row.id AND user_id = p_user_id;
      RETURN old_row;
    END IF;
  END IF;
  IF p_row IS NULL THEN RAISE EXCEPTION 'Transaction details are required'; END IF;
  source_id := NULLIF(p_row->>'account_id', '')::UUID;
  destination_id := NULLIF(p_row->>'to_account_id', '')::UUID;
  amount_value := NULLIF(p_row->>'amount', '')::NUMERIC;
  kind_value := (p_row->>'type')::public.transaction_type;
  IF source_id IS NULL OR amount_value IS NULL OR amount_value <= 0 OR p_row->>'date' IS NULL THEN
    RAISE EXCEPTION 'Enter a valid account, amount, and date';
  END IF;
  SELECT * INTO source_account FROM public.accounts WHERE id = source_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose an account that belongs to this profile'; END IF;
  currency_value := COALESCE(NULLIF(p_row->>'currency', ''), source_account.currency);
  IF currency_value <> source_account.currency THEN RAISE EXCEPTION 'Transaction currency must match its account'; END IF;
  IF kind_value = 'transfer' THEN
    IF destination_id IS NULL OR destination_id = source_id THEN RAISE EXCEPTION 'Choose a different destination account'; END IF;
    SELECT * INTO destination_account FROM public.accounts WHERE id = destination_id AND user_id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Choose a destination account that belongs to this profile'; END IF;
    destination_currency := destination_account.currency;
    destination_amount := COALESCE(NULLIF(p_row->>'to_amount', '')::NUMERIC, amount_value);
    IF destination_amount <= 0 THEN RAISE EXCEPTION 'Enter a positive amount received'; END IF;
    IF destination_currency = currency_value THEN
      destination_amount := amount_value;
    ELSIF COALESCE(NULLIF(p_row->>'exchange_rate', '')::NUMERIC, 0) <= 0 THEN
      RAISE EXCEPTION 'Enter the exchange rate for this cross-currency transfer';
    END IF;
  ELSE
    destination_id := NULL;
    destination_amount := NULL;
    destination_currency := NULL;
  END IF;

  IF p_action = 'create' THEN
    INSERT INTO public.transactions (user_id, account_id, to_account_id, type, amount, currency, to_amount, to_currency, exchange_rate, category, description, note, date, source)
    VALUES (p_user_id, source_id, destination_id, kind_value, amount_value, currency_value, destination_amount, destination_currency,
      NULLIF(p_row->>'exchange_rate', '')::NUMERIC, COALESCE(NULLIF(p_row->>'category', ''), 'Other'),
      COALESCE(NULLIF(p_row->>'description', ''), ''), COALESCE(p_row->>'note', ''), (p_row->>'date')::DATE,
      COALESCE(NULLIF(p_row->>'source', ''), 'manual'))
    RETURNING * INTO result_row;
  ELSE
    UPDATE public.transactions SET account_id = source_id, to_account_id = destination_id, type = kind_value,
      amount = amount_value, currency = currency_value, to_amount = destination_amount, to_currency = destination_currency,
      exchange_rate = NULLIF(p_row->>'exchange_rate', '')::NUMERIC,
      category = COALESCE(NULLIF(p_row->>'category', ''), 'Other'), description = COALESCE(p_row->>'description', ''),
      note = COALESCE(p_row->>'note', ''), date = (p_row->>'date')::DATE, updated_at = NOW()
    WHERE id = p_transaction_id AND user_id = p_user_id RETURNING * INTO result_row;
  END IF;

  IF kind_value = 'income' THEN
    UPDATE public.accounts SET balance = balance + amount_value WHERE id = source_id AND user_id = p_user_id;
  ELSIF kind_value = 'expense' THEN
    UPDATE public.accounts SET balance = balance - amount_value WHERE id = source_id AND user_id = p_user_id;
  ELSE
    UPDATE public.accounts SET balance = balance - amount_value WHERE id = source_id AND user_id = p_user_id;
    UPDATE public.accounts SET balance = balance + destination_amount WHERE id = destination_id AND user_id = p_user_id;
  END IF;
  RETURN result_row;
END;
$$;

REVOKE ALL ON FUNCTION public.mutate_financial_transaction(UUID, UUID, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_financial_transaction(UUID, UUID, TEXT, JSONB) TO service_role;
