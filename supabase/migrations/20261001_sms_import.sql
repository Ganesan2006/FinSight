-- Store only the normalized transaction and a one-way dedupe fingerprint.
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS sms_fingerprint TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_user_sms_fingerprint
  ON public.transactions(user_id, sms_fingerprint)
  WHERE sms_fingerprint IS NOT NULL;

-- Atomically add a transaction and adjust its account balance. A retry for the
-- same SMS returns no row and does not change the balance again.
CREATE OR REPLACE FUNCTION public.insert_sms_transaction(
  p_user_id UUID,
  p_sms_fingerprint TEXT,
  p_amount NUMERIC,
  p_type TEXT,
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
  IF p_amount <= 0 OR p_type NOT IN ('income', 'expense') THEN
    RAISE EXCEPTION 'Invalid SMS transaction';
  END IF;

  SELECT * INTO account_row
  FROM public.accounts
  WHERE user_id = p_user_id
  ORDER BY created_at
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.accounts(user_id, name, type, balance)
    VALUES (p_user_id, 'SMS Imports', 'cash', 0)
    RETURNING * INTO account_row;
  END IF;

  INSERT INTO public.transactions(
    user_id, account_id, type, amount, category, description, note, date,
    source, sms_fingerprint
  ) VALUES (
    p_user_id, account_row.id, p_type::public.transaction_type, p_amount,
    COALESCE(NULLIF(p_category, ''), 'Other'), COALESCE(p_description, ''),
    COALESCE(p_note, ''), COALESCE(p_date, CURRENT_DATE), 'sms', p_sms_fingerprint
  )
  ON CONFLICT (user_id, sms_fingerprint) WHERE sms_fingerprint IS NOT NULL DO NOTHING
  RETURNING * INTO transaction_row;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE public.accounts
  SET balance = balance + CASE WHEN p_type = 'income' THEN p_amount ELSE -p_amount END,
      updated_at = NOW()
  WHERE id = account_row.id AND user_id = p_user_id;

  RETURN transaction_row;
END;
$$;

REVOKE ALL ON FUNCTION public.insert_sms_transaction(UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_sms_transaction(UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, DATE) TO service_role;
