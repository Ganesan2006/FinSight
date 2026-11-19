-- Enhanced Financial SMS & Recurrence Indexing
-- Optimizes historical ledger interval analysis and account resolution for SMS imports.

-- Index for historical recurrence clustering by user and merchant description
CREATE INDEX IF NOT EXISTS idx_transactions_user_desc_date
  ON public.transactions(user_id, description, date DESC);

-- Index for fast user account lookup by type
CREATE INDEX IF NOT EXISTS idx_accounts_user_type
  ON public.accounts(user_id, type);

-- Index for bill search by name and user
CREATE INDEX IF NOT EXISTS idx_bills_user_name
  ON public.bills(user_id, name);
