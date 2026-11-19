-- Apply in the Supabase SQL Editor for existing installations.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone_number TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'dark';
