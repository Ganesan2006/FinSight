-- Compatibility for existing installations. New signups write the bcrypt
-- salt alongside the bcrypt hash; existing bcrypt hashes remain valid.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS password_salt TEXT;

-- bcrypt's encoded password_hash already contains its salt. The separate
-- column is kept for schema compatibility with older database versions.
ALTER TABLE public.users
  ALTER COLUMN password_salt SET DEFAULT '';
