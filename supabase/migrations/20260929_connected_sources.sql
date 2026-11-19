-- User/provider connection records used by the accounts screen and /api/sync.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.connected_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('broker', 'card')),
  provider TEXT NOT NULL,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'coming-soon', 'disconnected')),
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, kind, provider)
);

NOTIFY pgrst, 'reload schema';
