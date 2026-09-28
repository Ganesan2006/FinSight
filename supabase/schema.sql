-- ============================================================
-- FINANCE COPILOT - Supabase PostgreSQL Schema
-- "Personal Finance Manager" with RLS
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. PROFILES
-- ============================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  currency TEXT NOT NULL DEFAULT 'INR',
  monthly_income NUMERIC(15,2) NOT NULL DEFAULT 0,
  avatar_url TEXT,
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 2. ACCOUNTS (Bank, Cash, Credit Card)
-- ============================================================
CREATE TYPE public.account_type AS ENUM ('bank', 'cash', 'credit');

CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type public.account_type NOT NULL DEFAULT 'bank',
  balance NUMERIC(15,2) NOT NULL DEFAULT 0,
  icon TEXT DEFAULT 'wallet',
  color TEXT DEFAULT '#6366f1',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own accounts"
  ON public.accounts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_accounts_user ON public.accounts(user_id);

-- ============================================================
-- 3. TRANSACTIONS
-- ============================================================
CREATE TYPE public.transaction_type AS ENUM ('income', 'expense', 'transfer');

CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  to_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL, -- for transfers
  type public.transaction_type NOT NULL,
  amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  category TEXT NOT NULL DEFAULT 'Other',
  description TEXT DEFAULT '',
  note TEXT DEFAULT '',
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own transactions"
  ON public.transactions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_transactions_user ON public.transactions(user_id);
CREATE INDEX idx_transactions_date ON public.transactions(user_id, date DESC);
CREATE INDEX idx_transactions_category ON public.transactions(user_id, category);
CREATE INDEX idx_transactions_account ON public.transactions(account_id);

-- ============================================================
-- 4. DUES (Money owed / Money lent)
-- ============================================================
CREATE TYPE public.due_direction AS ENUM ('i_owe', 'owed_to_me');

CREATE TABLE public.dues (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  person_name TEXT NOT NULL,
  amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  paid_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  direction public.due_direction NOT NULL,
  due_date DATE,
  note TEXT DEFAULT '',
  is_settled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.dues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own dues"
  ON public.dues FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_dues_user ON public.dues(user_id);

-- ============================================================
-- 4b. DUE PAYMENTS (payment history for partial payments)
-- ============================================================
CREATE TABLE public.due_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  due_id UUID NOT NULL REFERENCES public.dues(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.due_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own due payments"
  ON public.due_payments FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_due_payments_due ON public.due_payments(due_id);

-- ============================================================
-- 5. INVESTMENTS
-- ============================================================
CREATE TYPE public.investment_type AS ENUM ('stocks', 'mutual_funds', 'gold', 'fd', 'crypto', 'real_estate', 'other');

CREATE TABLE public.investments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_name TEXT NOT NULL,
  type public.investment_type NOT NULL,
  invested_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (invested_amount >= 0),
  current_value NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (current_value >= 0),
  units NUMERIC(15,4) DEFAULT 0,
  purchase_date DATE DEFAULT CURRENT_DATE,
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.investments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own investments"
  ON public.investments FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_investments_user ON public.investments(user_id);

-- ============================================================
-- 5b. INVESTMENT TRANSACTIONS (SIPs, buys, sells)
-- ============================================================
CREATE TYPE public.investment_tx_type AS ENUM ('buy', 'sell', 'sip', 'dividend');

CREATE TABLE public.investment_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  investment_id UUID NOT NULL REFERENCES public.investments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type public.investment_tx_type NOT NULL DEFAULT 'buy',
  amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  units NUMERIC(15,4) DEFAULT 0,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.investment_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own investment transactions"
  ON public.investment_transactions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_inv_tx_investment ON public.investment_transactions(investment_id);

-- ============================================================
-- 6. GOALS
-- ============================================================
CREATE TYPE public.goal_priority AS ENUM ('essential', 'important', 'flexible');

CREATE TABLE public.goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_amount NUMERIC(15,2) NOT NULL CHECK (target_amount > 0),
  current_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (current_amount >= 0),
  target_date DATE NOT NULL,
  priority public.goal_priority NOT NULL DEFAULT 'important',
  icon TEXT DEFAULT '🎯',
  color TEXT DEFAULT '#8b5cf6',
  monthly_allocation NUMERIC(15,2) DEFAULT 0,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own goals"
  ON public.goals FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_goals_user ON public.goals(user_id);

-- ============================================================
-- 7. BILLS (Recurring)
-- ============================================================
CREATE TYPE public.bill_frequency AS ENUM ('weekly', 'monthly', 'quarterly', 'yearly');
CREATE TYPE public.bill_status AS ENUM ('upcoming', 'paid', 'overdue');

CREATE TABLE public.bills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  frequency public.bill_frequency NOT NULL DEFAULT 'monthly',
  next_due_date DATE NOT NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  category TEXT DEFAULT 'Other',
  icon TEXT DEFAULT '🧾',
  status public.bill_status NOT NULL DEFAULT 'upcoming',
  auto_pay BOOLEAN NOT NULL DEFAULT FALSE,
  reminder_days INTEGER DEFAULT 3,
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own bills"
  ON public.bills FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_bills_user ON public.bills(user_id);
CREATE INDEX idx_bills_due ON public.bills(user_id, next_due_date);

-- ============================================================
-- 7b. BILL PAYMENTS (payment history)
-- ============================================================
CREATE TABLE public.bill_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.bill_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own bill payments"
  ON public.bill_payments FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_bill_payments_bill ON public.bill_payments(bill_id);

-- ============================================================
-- 8. CATEGORIES (configurable spending categories)
-- ============================================================
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '📦',
  color TEXT DEFAULT '#6366f1',
  budget_limit NUMERIC(15,2) DEFAULT 0,
  type public.transaction_type NOT NULL DEFAULT 'expense',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own categories"
  ON public.categories FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_categories_user ON public.categories(user_id);

-- ============================================================
-- UTILITY: Updated_at trigger
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.dues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.investments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.bills
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- SEED: Default categories for new users
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_default_categories()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.categories (user_id, name, icon, color, type) VALUES
    (NEW.id, 'Food & Dining', '🍕', '#ef4444', 'expense'),
    (NEW.id, 'Shopping', '🛍️', '#f97316', 'expense'),
    (NEW.id, 'Transport', '🚗', '#eab308', 'expense'),
    (NEW.id, 'Entertainment', '🎬', '#22c55e', 'expense'),
    (NEW.id, 'Healthcare', '💊', '#06b6d4', 'expense'),
    (NEW.id, 'Education', '📚', '#8b5cf6', 'expense'),
    (NEW.id, 'Bills & Utilities', '💡', '#ec4899', 'expense'),
    (NEW.id, 'Groceries', '🛒', '#14b8a6', 'expense'),
    (NEW.id, 'Rent', '🏠', '#6366f1', 'expense'),
    (NEW.id, 'Insurance', '🛡️', '#64748b', 'expense'),
    (NEW.id, 'Other', '📦', '#94a3b8', 'expense'),
    (NEW.id, 'Salary', '💰', '#22c55e', 'income'),
    (NEW.id, 'Freelance', '💻', '#06b6d4', 'income'),
    (NEW.id, 'Interest', '🏦', '#8b5cf6', 'income'),
    (NEW.id, 'Gift', '🎁', '#ec4899', 'income'),
    (NEW.id, 'Other Income', '💵', '#94a3b8', 'income');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_profile_created_seed_categories
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_categories();

-- Relationship ownership hardening: prevent linking a user's row to another user's
-- account, bill, due, or investment even when the inserted row itself has their user_id.
DROP POLICY IF EXISTS "Users can CRUD own transactions" ON public.transactions;
CREATE POLICY "Users can CRUD own transactions"
  ON public.transactions FOR ALL
  USING (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = account_id AND a.user_id = auth.uid())
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.accounts a WHERE a.id = account_id AND a.user_id = auth.uid())
    AND (to_account_id IS NULL OR EXISTS (
      SELECT 1 FROM public.accounts a WHERE a.id = to_account_id AND a.user_id = auth.uid()
    ))
  );

DROP POLICY IF EXISTS "Users can CRUD own due payments" ON public.due_payments;
CREATE POLICY "Users can CRUD own due payments"
  ON public.due_payments FOR ALL
  USING (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.dues d WHERE d.id = due_id AND d.user_id = auth.uid())
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.dues d WHERE d.id = due_id AND d.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can CRUD own investment transactions" ON public.investment_transactions;
CREATE POLICY "Users can CRUD own investment transactions"
  ON public.investment_transactions FOR ALL
  USING (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.investments i WHERE i.id = investment_id AND i.user_id = auth.uid())
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.investments i WHERE i.id = investment_id AND i.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can CRUD own bills" ON public.bills;
CREATE POLICY "Users can CRUD own bills"
  ON public.bills FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (account_id IS NULL OR EXISTS (
      SELECT 1 FROM public.accounts a WHERE a.id = account_id AND a.user_id = auth.uid()
    ))
  );

DROP POLICY IF EXISTS "Users can CRUD own bill payments" ON public.bill_payments;
CREATE POLICY "Users can CRUD own bill payments"
  ON public.bill_payments FOR ALL
  USING (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.bills b WHERE b.id = bill_id AND b.user_id = auth.uid())
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.bills b WHERE b.id = bill_id AND b.user_id = auth.uid())
  );

-- Contact fields used by the native account profile.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- All money-moving updates run in one database transaction under the signed-in
-- user's RLS context. The mobile app never updates account balances directly.
CREATE OR REPLACE FUNCTION public.create_transaction(
  p_account_id UUID,
  p_to_account_id UUID,
  p_type public.transaction_type,
  p_amount NUMERIC,
  p_category TEXT,
  p_description TEXT,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS public.transactions
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  created public.transactions;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be greater than zero';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.accounts a
    WHERE a.id = p_account_id AND a.user_id = auth.uid() AND a.is_active
  ) THEN
    RAISE EXCEPTION 'Source account was not found';
  END IF;
  IF p_type = 'transfer' AND (
    p_to_account_id IS NULL OR p_to_account_id = p_account_id OR NOT EXISTS (
      SELECT 1 FROM public.accounts a
      WHERE a.id = p_to_account_id AND a.user_id = auth.uid() AND a.is_active
    )
  ) THEN
    RAISE EXCEPTION 'Choose a different destination account';
  END IF;

  INSERT INTO public.transactions (
    user_id, account_id, to_account_id, type, amount, category, description, date
  ) VALUES (
    auth.uid(), p_account_id,
    CASE WHEN p_type = 'transfer' THEN p_to_account_id ELSE NULL END,
    p_type, p_amount, COALESCE(NULLIF(p_category, ''), 'Other'),
    COALESCE(p_description, ''), COALESCE(p_date, CURRENT_DATE)
  ) RETURNING * INTO created;

  IF p_type = 'income' THEN
    UPDATE public.accounts SET balance = balance + p_amount WHERE id = p_account_id;
  ELSIF p_type = 'expense' THEN
    UPDATE public.accounts SET balance = balance - p_amount WHERE id = p_account_id;
  ELSE
    UPDATE public.accounts SET balance = balance - p_amount WHERE id = p_account_id;
    UPDATE public.accounts SET balance = balance + p_amount WHERE id = p_to_account_id;
  END IF;
  RETURN created;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_bill_paid(p_bill_id UUID)
RETURNS public.bills
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  selected_bill public.bills;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  SELECT * INTO selected_bill FROM public.bills
    WHERE id = p_bill_id AND user_id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bill was not found';
  END IF;
  IF selected_bill.status = 'paid' THEN
    RETURN selected_bill;
  END IF;

  INSERT INTO public.bill_payments (bill_id, user_id, amount, date)
    VALUES (selected_bill.id, auth.uid(), selected_bill.amount, CURRENT_DATE);

  IF selected_bill.account_id IS NOT NULL THEN
    UPDATE public.accounts
      SET balance = balance - selected_bill.amount
      WHERE id = selected_bill.account_id AND user_id = auth.uid();
    INSERT INTO public.transactions (
      user_id, account_id, type, amount, category, description, date
    ) VALUES (
      auth.uid(), selected_bill.account_id, 'expense', selected_bill.amount,
      COALESCE(selected_bill.category, 'Bills'), selected_bill.name, CURRENT_DATE
    );
  END IF;

  UPDATE public.bills SET status = 'paid' WHERE id = selected_bill.id
    RETURNING * INTO selected_bill;
  RETURN selected_bill;
END;
$$;
