export interface Profile {
  id: string;
  name: string;
  currency: string;
  monthly_income: number;
  created_at: string;
  updated_at: string;
}

export type AccountType = 'bank' | 'cash' | 'credit' | 'wallet';

export interface Account {
  id: string;
  profile_id: string;
  name: string;
  type: AccountType;
  balance: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

export type TransactionType = 'income' | 'expense' | 'transfer';

export interface Transaction {
  id: string;
  profile_id: string;
  account_id: string;
  category_id?: string;
  amount: number;
  type: TransactionType;
  description: string;
  date: string;
  created_at: string;
}

export type DueDirection = 'i_owe' | 'owed_to_me';

export interface Due {
  id: string;
  profile_id: string;
  person_name: string;
  amount: number;
  direction: DueDirection;
  description?: string;
  due_date?: string;
  is_settled: boolean;
  created_at: string;
  updated_at: string;
}

export interface DuePayment {
  id: string;
  due_id: string;
  amount: number;
  date: string;
  created_at: string;
}

export type InvestmentType = 'mutual_fund' | 'stock' | 'gold' | 'fd' | 'other';

export interface Investment {
  id: string;
  profile_id: string;
  name: string;
  type: InvestmentType;
  invested_amount: number;
  current_value: number;
  currency: string;
  created_at: string;
  updated_at: string;
}

export type InvestmentTxType = 'buy' | 'sell' | 'dividend';

export interface InvestmentTransaction {
  id: string;
  investment_id: string;
  amount: number;
  units?: number;
  price_per_unit?: number;
  type: InvestmentTxType;
  date: string;
  created_at: string;
}

export type GoalPriority = 'high' | 'medium' | 'low';

export interface Goal {
  id: string;
  profile_id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  target_date?: string;
  priority: GoalPriority;
  category: string;
  created_at: string;
  updated_at: string;
}

export type BillFrequency = 'monthly' | 'quarterly' | 'yearly' | 'one_time';
export type BillStatus = 'paid' | 'upcoming' | 'overdue' | 'due-soon';

export interface Bill {
  id: string;
  profile_id: string;
  name: string;
  amount: number;
  frequency: BillFrequency;
  next_due_date: string;
  category_id?: string;
  auto_pay: boolean;
  created_at: string;
  updated_at: string;
}

export interface BillPayment {
  id: string;
  bill_id: string;
  amount: number;
  payment_date: string;
  created_at: string;
}

export interface Category {
  id: string;
  profile_id?: string;
  name: string;
  icon: string;
  color: string;
  type: 'income' | 'expense';
  created_at: string;
}

export type QuickAddType = 'transaction' | 'due' | 'investment' | 'goal' | 'bill';

export interface GoalConflict {
  goal1: Goal;
  goal2: Goal;
  shortfall: number;
  suggestion: string;
}

export interface GoalAnalysis {
  totalRequired: number;
  totalAvailable: number;
  shortfall: number;
  conflicts: GoalConflict[];
  adjustedGoals: Goal[];
}
