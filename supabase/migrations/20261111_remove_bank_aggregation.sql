-- Remove bank aggregator connections. Existing account and transaction rows
-- imported in the past are preserved as user ledger history.
DELETE FROM public.connected_sources WHERE kind = 'aggregator';

ALTER TABLE public.connected_sources
  DROP CONSTRAINT IF EXISTS connected_sources_kind_check;

ALTER TABLE public.connected_sources
  ADD CONSTRAINT connected_sources_kind_check CHECK (kind IN ('broker', 'card'));
