-- The API's generic list helper orders rows by created_at. Reconciliation
-- records use reconciled_at for audit chronology, so expose created_at too.
ALTER TABLE public.account_reconciliations
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;

UPDATE public.account_reconciliations
SET created_at = COALESCE(reconciled_at, NOW())
WHERE created_at IS NULL;

ALTER TABLE public.account_reconciliations
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN created_at SET NOT NULL;
