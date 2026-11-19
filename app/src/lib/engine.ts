// ============================================================
// App state engine.
//   FRONTEND ⇄ BACKEND split: all persistence goes through the
//   REST API (src/lib/restClient.ts → backend/server.js). Account,
//   transaction, goal, bill and profile mutations are persisted in
//   Supabase. A local snapshot is kept for read-only access during outages;
//   financial changes still require a live server response.
// ============================================================
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Platform, Share } from "react-native";
import * as rest from "./restClient";
import type { Priority } from "./goalEngine";

export type Tab = "Spend" | "Due" | "Invest" | "Goal" | "Bill";
export type Kind = "Expense" | "Income" | "Transfer" | "Due" | "Bill" | "Goal" | "Investment";

export interface UserProfile { fullName: string; email: string; phone: string; currency?: string }
export interface Account { id: string; name: string; type: string; balance: number; currency: string; institutionName?: string | null; accountMask?: string | null }
export interface Tx { id: string; title: string; category: string; amount: number; currency: string; toAmount?: number; toCurrency?: string; exchangeRate?: number; kind: "income" | "expense" | "transfer"; date: string; note?: string; accountId?: string; accountName?: string; accountMask?: string | null; toAccountId?: string; toAccountName?: string; source?: string }
export interface Due { id: string; person: string; amount: number; paid: number; currency: string; direction: "i_owe" | "owed_to_me"; date: string; note?: string }
export interface DuePayment { id: string; amount: number; currency: string; note: string; date: string }
export interface Asset { id: string; name: string; type: string; invested: number; value: number; currency: string }
export interface InvTx { id: string; type: string; amount: number; currency: string; date: string }
export interface Goal { id: string; name: string; target: number; saved: number; currency: string; date: string; priority: Priority }
export interface Bill { id: string; name: string; amount: number; currency: string; category: string; frequency: string; date: string; status: string; accountId?: string; reminderDays?: number }
export interface BillOccurrence { id: string; bill_id: string; due_date: string; amount: number; currency: string; status: string }
export interface CategoryOption { id: string; name: string; type: string; budgetLimit: number }
export interface Budget { id: string; category: string; period_start: string; amount: number; currency: string; rollover_enabled: boolean; carry_in: number }
export interface AccountReconciliation { id: string; account_id: string; system_balance: number; actual_balance: number; adjustment: number; note: string; reconciled_at: string }
export interface ExchangeRate { id: string; from_currency: string; to_currency: string; rate: number; effective_on: string }
export interface ImportBatch { id: string; source: "csv" | "sms"; file_name?: string | null; rows_total: number; imported_count: number; duplicate_count: number; failed_count: number; errors: any[]; created_at: string }

const iso = (offsetDays = 0) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); return d.toISOString().slice(0, 10); };
const nextBillDate = (value: string, frequency: string) => {
  const d = new Date(`${value}T12:00:00`);
  if (frequency.toLowerCase() === "weekly") d.setDate(d.getDate() + 7);
  else {
    const day = d.getDate();
    const monthDelta = frequency.toLowerCase() === "quarterly" ? 3 : frequency.toLowerCase() === "yearly" ? 12 : 1;
    d.setDate(1);
    d.setMonth(d.getMonth() + monthDelta);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, lastDay));
  }
  return d.toISOString().slice(0, 10);
};
const assetDbType: Record<string, string> = { "Mutual fund": "mutual_funds", Stocks: "stocks", Gold: "gold", FD: "fd", Crypto: "crypto", "Real estate": "real_estate", PPF: "other" };

export interface QuickInput {
  kind: Kind;
  name: string;
  amount: number;
  extra: string;          // category / direction / frequency / asset type
  priority?: Priority;
  date?: string;
  accountId?: string;
  toAccountId?: string;
  toAmount?: number;
  exchangeRate?: number;
  currency?: string;
  currentValue?: number;
  savedAmount?: number;
  reminderDays?: number;
  note?: string;
}

export function useAppEngine() {
  const cloud = rest.isApiConfigured; // REST backend configured? → live mode
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [authMode, setAuthMode] = useState<"welcome" | "login" | "signup" | "reset">("welcome");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authInfo, setAuthInfo] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [tab, setTab] = useState<Tab>("Spend");
  const [subpage, setSubpageState] = useState<string>("");
  const subpageRef = useRef("");
  const subpageHistory = useRef<string[]>([]);
  const setSubpage = useCallback((next: string) => {
    const current = subpageRef.current;
    const history = subpageHistory.current;
    let resolved = next;
    if (!next) resolved = history.pop() || "";
    else if (next !== current) {
      if (history[history.length - 1] === next) history.pop();
      else if (current) history.push(current);
    }
    subpageRef.current = resolved;
    setSubpageState(resolved);
  }, []);
  const goBack = useCallback(() => setSubpage(""), [setSubpage]);
  const selectTab = useCallback((next: Tab) => {
    setTab(next);
    subpageHistory.current = [];
    subpageRef.current = "";
    setSubpageState("");
  }, []);
  const [selected, setSelected] = useState<any>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [toast, setToast] = useState<string>("");
  const [notifications, setNotifications] = useState<{ id: string; title: string; body: string; time: string; read: boolean }[]>([]);
  const [offline, setOffline] = useState(false);

  const [currency, setCurrency] = useState("INR");
  const [themeName, setThemeName] = useState<"dark" | "light">("dark");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [tx, setTx] = useState<Tx[]>([]);
  const [dues, setDues] = useState<Due[]>([]);
  const [duePayments, setDuePayments] = useState<Record<string, DuePayment[]>>({});
  const [assets, setAssets] = useState<Asset[]>([]);
  const [invTx, setInvTx] = useState<Record<string, InvTx[]>>({});
  const [goals, setGoals] = useState<Goal[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [billPayments, setBillPayments] = useState<Record<string, { id: string; amount: number; date: string; occurrenceId?: string; transactionId?: string | null }[]>>({});
  const [billOccurrences, setBillOccurrences] = useState<BillOccurrence[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [monthlyIncome, setMonthlyIncome] = useState(0);
  const [monthlyIncomeCurrency, setMonthlyIncomeCurrency] = useState("INR");
  const [reconciliations, setReconciliations] = useState<AccountReconciliation[]>([]);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRate[]>([]);
  const [importBatches, setImportBatches] = useState<ImportBatch[]>([]);
  const billPaymentLocks = useRef(new Set<string>());

  const notify = (title: string, body: string) => {
    setToast(`${title} · ${body}`);
    setTimeout(() => setToast(""), 3200);
  };

  const hydrate = (w: any) => {
    setProfile(w.profile);
    setAccounts(w.accounts || []);
    setTx(w.transactions || w.tx || []);
    setDues(w.dues || []);
    setAssets(w.investments || w.assets || []);
    setGoals(w.goals || []);
    setBills(w.bills || []);
    setCategories(w.categories || []);
    setMonthlyIncome(w.monthlyIncome || 0);
  };

  // ---------- derived metrics ----------
  const today = new Date();
  const currentMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const todayIso = iso(0);
  const rateFor = (fromCurrency: string, toCurrency = currency): number | null => {
    if (fromCurrency === toCurrency) return 1;
    const latest = (from: string, to: string) => exchangeRates
      .filter((rate) => rate.from_currency === from && rate.to_currency === to && rate.effective_on <= todayIso)
      .sort((a, b) => b.effective_on.localeCompare(a.effective_on))[0]?.rate;
    const direct = latest(fromCurrency, toCurrency);
    if (direct && direct > 0) return direct;
    const inverse = latest(toCurrency, fromCurrency);
    return inverse && inverse > 0 ? 1 / inverse : null;
  };
  const convertToBase = (amount: number, fromCurrency: string) => {
    const rate = rateFor(fromCurrency);
    return rate === null ? null : amount * rate;
  };
  const balanceByCurrency = accounts.reduce((totals: Record<string, number>, a) => {
    const code = a.currency || currency;
    totals[code] = (totals[code] || 0) + a.balance;
    return totals;
  }, {});
  const balanceConversion = Object.entries(balanceByCurrency).map(([code, amount]) => ({ code, amount, rate: rateFor(code) }));
  const convertedBalanceTotal = balanceConversion.every((item) => item.rate !== null)
    ? balanceConversion.reduce((total, item) => total + item.amount * (item.rate || 0), 0) : null;
  const missingBalanceCurrencies = balanceConversion.filter((item) => item.rate === null).map((item) => item.code);
  const balance = balanceByCurrency[currency] || 0;
  const monthTx = tx.filter((t) => String(t.date).slice(0, 7) === currentMonthKey);
  const spendByAccount = accounts.map((account) => {
    const records = monthTx.filter((item) => item.kind === "expense" && item.accountId === account.id && item.currency === account.currency);
    return { accountId: account.id, name: account.name, type: account.type, currency: account.currency, accountMask: account.accountMask, institutionName: account.institutionName, spent: records.reduce((sum, item) => sum + item.amount, 0), count: records.length };
  });
  const monthCurrencyTotals = Object.values(monthTx.reduce((totals: Record<string, { currency: string; income: number; spent: number }>, t) => {
    const code = t.currency || currency;
    const current = totals[code] || (totals[code] = { currency: code, income: 0, spent: 0 });
    if (t.kind === "income") current.income += t.amount;
    if (t.kind === "expense") current.spent += t.amount;
    return totals;
  }, {})).sort((a, b) => a.currency.localeCompare(b.currency));
  const convertedMonthLines = monthCurrencyTotals.map((item) => ({ ...item, rate: rateFor(item.currency) }));
  const convertedMonthSummary = convertedMonthLines.length > 0 && convertedMonthLines.every((item) => item.rate !== null) ? convertedMonthLines.reduce((summary, item) => ({
    income: summary.income + item.income * (item.rate || 0), spent: summary.spent + item.spent * (item.rate || 0),
  }), { income: 0, spent: 0 }) : null;
  const currentPeriodStart = `${currentMonthKey}-01`;
  const currentPeriodEnd = new Date(Date.UTC(today.getFullYear(), today.getMonth() + 1, 1)).toISOString().slice(0, 10);
  const budgetProgress = budgets.filter((item) => item.period_start === currentPeriodStart).map((budget) => {
    const transactionSpend = tx.filter((item) => item.kind === "expense" && item.category === budget.category && item.currency === budget.currency && item.date >= currentPeriodStart && item.date < currentPeriodEnd).reduce((sum, item) => sum + item.amount, 0);
    const unpaidBillSpend = Object.entries(billPayments).reduce((sum, [billId, payments]) => {
      const bill = bills.find((item) => item.id === billId);
      if (!bill || bill.category !== budget.category || bill.currency !== budget.currency) return sum;
      return sum + payments.filter((payment) => !payment.transactionId && payment.date >= currentPeriodStart && payment.date < currentPeriodEnd).reduce((subtotal, payment) => subtotal + payment.amount, 0);
    }, 0);
    const available = budget.amount + budget.carry_in;
    const spentAmount = transactionSpend + unpaidBillSpend;
    return { ...budget, spent: spentAmount, available, remaining: available - spentAmount, percent: available > 0 ? spentAmount / available * 100 : 0 };
  });
  const budgetAlerts = budgetProgress.filter((item) => item.percent >= 80).map((item) => ({
    id: `budget-${item.id}`, category: item.category, currency: item.currency,
    percent: item.percent, over: item.remaining < 0, amount: item.remaining,
  }));
  const selectedMonthTotals = monthCurrencyTotals.find((x) => x.currency === currency);
  const spent = convertedMonthSummary?.spent ?? selectedMonthTotals?.spent ?? 0;
  const monthlyIncomeRate = rateFor(monthlyIncomeCurrency);
  const convertedMonthlyIncome = monthlyIncomeRate === null ? 0 : monthlyIncome * monthlyIncomeRate;
  const income = monthlyIncome > 0 && convertedMonthlyIncome > 0
    ? convertedMonthlyIncome
    : convertedMonthSummary?.income ?? selectedMonthTotals?.income ?? 0;
  const catTotals: [string, number][] = (() => { const o: Record<string, number> = {}; monthTx.filter((t) => t.kind === "expense" && (t.currency || currency) === currency).forEach((t) => (o[t.category] = (o[t.category] || 0) + t.amount)); return Object.entries(o).sort((a, b) => b[1] - a[1]); })();
  const categoryCurrencySpent = selectedMonthTotals?.spent || 0;
  const owe = dues.filter((d) => d.direction === "i_owe" && d.currency === currency).reduce((n, d) => n + Math.max(0, d.amount - d.paid), 0);
  const owed = dues.filter((d) => d.direction === "owed_to_me" && d.currency === currency).reduce((n, d) => n + Math.max(0, d.amount - d.paid), 0);
  const investedTotal = assets.filter((a) => a.currency === currency).reduce((n, a) => n + a.invested, 0);
  const portfolioValue = assets.filter((a) => a.currency === currency).reduce((n, a) => n + a.value, 0);
  const monthlyBillTotals = Object.values(bills.filter((b) => b.status.toLowerCase() !== "paid").reduce((totals: Record<string, number>, b) => {
    const frequency = b.frequency.toLowerCase();
    const monthlyAmount = b.amount * (frequency === "weekly" ? 4.33 : frequency === "yearly" ? 1 / 12 : frequency === "quarterly" ? 1 / 3 : 1);
    const code = b.currency || currency;
    totals[code] = (totals[code] || 0) + monthlyAmount;
    return totals;
  }, {}));
  const billRates = Object.entries(monthlyBillTotals).map(([code, amount]) => ({ amount, rate: rateFor(code) }));
  const monthlyBills = billRates.length && billRates.every((item) => item.rate !== null)
    ? billRates.reduce((total, item) => total + item.amount * (item.rate || 0), 0)
    : monthlyBillTotals[currency] || 0;
  const availableSavings = Math.max(0, income - spent - monthlyBills);
  const remainingBillAmount = (bill: Bill) => {
    const occurrence = billOccurrences.find((item) => item.bill_id === bill.id && item.due_date === bill.date);
    if (occurrence?.status === "paid" || occurrence?.status === "skipped") return 0;
    const paid = (billPayments[bill.id] || []).filter((payment) => occurrence ? payment.occurrenceId === occurrence.id : payment.date === bill.date).reduce((sum, payment) => sum + payment.amount, 0);
    return Math.max(0, (occurrence?.amount || bill.amount) - paid);
  };
  const dueThisWeekByCurrency = Object.values(bills.filter((bill) => bill.status.toLowerCase() !== "paid" && bill.date >= todayIso && bill.date <= iso(7))
    .reduce((totals: Record<string, { currency: string; amount: number; count: number }>, bill) => {
      const code = bill.currency || currency;
      const current = totals[code] || (totals[code] = { currency: code, amount: 0, count: 0 });
      const remaining = remainingBillAmount(bill);
      current.amount += remaining;
      if (remaining > 0) current.count += 1;
      return totals;
    }, {})).sort((a, b) => a.currency.localeCompare(b.currency));
  const dueThisWeek = dueThisWeekByCurrency.find((item) => item.currency === currency)?.amount || 0;
  const overdueBills = bills.filter((bill) => bill.status.toLowerCase() !== "paid" && bill.date < todayIso && remainingBillAmount(bill) > 0);

  // ---------- REST sync helpers (frontend ⇄ backend) ----------
  const hydrateFromSync = (p: rest.SyncPayload) => {
    const accMap: Record<string, string> = {};
    setAccounts((p.accounts || []).map((a: any) => { accMap[a.id] = a.name; return { id: a.id, name: a.name, type: a.type, balance: Number(a.balance || 0), currency: a.currency || p.profile?.currency || "INR", institutionName: a.institution_name || null, accountMask: a.account_mask || null }; }));
    setTx((p.transactions || []).map((t: any) => ({
      id: t.id, title: t.title || t.description || t.category, category: t.category, amount: Number(t.amount),
      currency: t.currency || "INR", toAmount: t.to_amount == null ? undefined : Number(t.to_amount), toCurrency: t.to_currency, exchangeRate: t.exchange_rate == null ? undefined : Number(t.exchange_rate),
      kind: t.type, date: String(t.date || "").slice(0, 10), note: t.note, accountId: t.account_id, accountName: accMap[t.account_id], accountMask: (p.accounts || []).find((a: any) => a.id === t.account_id)?.account_mask || null, source: t.source || "manual",
      toAccountId: t.to_account_id, toAccountName: accMap[t.to_account_id],
    })));
    setDues((p.dues || []).map((d: any) => ({
      id: d.id, person: d.person_name, amount: Number(d.amount), paid: Number(d.paid_amount || 0), currency: d.currency || "INR",
      direction: d.direction, date: String(d.due_date || "").slice(0, 10), note: d.note,
    })));
    setAssets((p.investments || []).map((a: any) => ({
      id: a.id, name: a.asset_name, type: a.type, invested: Number(a.invested_amount), value: Number(a.current_value), currency: a.currency || "INR",
    })));
    setGoals((p.goals || []).map((g: any) => ({
      id: g.id, name: g.name, target: Number(g.target_amount), saved: Number(g.current_amount || 0), currency: g.currency || "INR",
      date: String(g.target_date || "").slice(0, 10), priority: g.priority,
    })));
    setBills((p.bills || []).map((b: any) => ({
      id: b.id, name: b.name, amount: Number(b.amount), frequency: b.frequency,
      currency: b.currency || "INR", category: b.category || "Other", date: String(b.next_due_date || "").slice(0, 10), status: b.status, accountId: b.account_id, reminderDays: b.reminder_days,
    })));
    setBillOccurrences((p.billOccurrences || []).map((x: any) => ({ ...x, amount: Number(x.amount), due_date: String(x.due_date || "").slice(0, 10) })));
    setCategories((p.categories || []).map((c: any) => ({ id: c.id, name: c.name, type: c.type, budgetLimit: Number(c.budget_limit || 0) })));
    setBudgets((p.budgets || []).map((b: any) => ({ ...b, amount: Number(b.amount), carry_in: Number(b.carry_in || 0) })));
    const dp: Record<string, DuePayment[]> = {};
    (p.duePayments || []).forEach((x: any) => { const k = x.due_id; (dp[k] = dp[k] || []).push({ id: x.id, amount: Number(x.amount), currency: x.currency || "INR", note: x.note || "", date: String(x.date || x.payment_date || x.created_at || "").slice(0, 10) }); });
    setDuePayments(dp);
    const bp: Record<string, { id: string; amount: number; date: string; occurrenceId?: string; transactionId?: string | null }[]> = {};
    (p.billPayments || []).forEach((x: any) => { const k = x.bill_id; (bp[k] = bp[k] || []).push({ id: x.id, amount: Number(x.amount), date: String(x.date || x.paid_on || "").slice(0, 10), occurrenceId: x.occurrence_id, transactionId: x.transaction_id }); });
    setBillPayments(bp);
    const it: Record<string, InvTx[]> = {};
    (p.invTx || []).forEach((x: any) => { const k = x.investment_id; (it[k] = it[k] || []).push({ id: x.id, type: x.type, amount: Number(x.amount), currency: x.currency || "INR", date: String(x.date || "").slice(0, 10) }); });
    setInvTx(it);
    if (p.profile) {
      setProfile({ fullName: p.profile.full_name || "", email: p.profile.email || "", phone: p.profile.phone_number || "" });
      setCurrency(p.profile.currency || "INR");
      if (p.profile.theme === "dark" || p.profile.theme === "light") setThemeName(p.profile.theme);
    }
    setMonthlyIncome(Number(p.profile?.monthly_income || 0));
    setMonthlyIncomeCurrency(p.profile?.monthly_income_currency || p.profile?.currency || "INR");
    setReconciliations((p.reconciliations || []).map((x: any) => ({
      id: x.id, account_id: x.account_id, system_balance: Number(x.system_balance),
      actual_balance: Number(x.actual_balance), adjustment: Number(x.adjustment), note: x.note || "",
      reconciled_at: x.reconciled_at,
    })));
    setExchangeRates((p.exchangeRates || []).map((x: any) => ({ ...x, rate: Number(x.rate) })));
    setImportBatches((p.importBatches || []).map((x: any) => ({
      ...x, rows_total: Number(x.rows_total), imported_count: Number(x.imported_count),
      duplicate_count: Number(x.duplicate_count), failed_count: Number(x.failed_count),
    })));
  };

  const refreshCloud = async () => {
    if (!cloud) return;
    try {
      const payload = await rest.apiSync();
      hydrateFromSync(payload);
      setOffline(Boolean(payload.offline));
    } catch (e: any) {
      setOffline(true);
      Alert.alert("Workspace sync failed", e?.message || "Could not sync with the REST API.");
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      if (!cloud) { if (active) setProfileLoaded(true); return; }
      // App loading → dashboard: restore the JWT session and pull the workspace.
      if (!await rest.getAuthToken()) {
        if (active) { setProfile(null); setAuthMode("welcome"); setProfileLoaded(true); }
        return;
      }
      let me: rest.AuthUser | null = null;
      let authRejected = false;
      let authFailureMessage = "";
      try { me = await rest.apiMe(); }
      catch (error: any) {
        if ([401, 403, 423].includes(Number(error?.status))) {
          authRejected = true;
          authFailureMessage = error?.message || "Please sign in again.";
          await rest.apiLogout();
        }
      }
      if (!active) return;
      if (me) {
        setProfile({ fullName: me.fullName, email: me.email, phone: me.phone || "" });
        await refreshCloud();
        setProfileLoaded(true);
      } else if (authRejected) {
        setProfile(null);
        setAuthMode("login");
        setAuthError(authFailureMessage);
      } else {
        const cached = await rest.apiCachedWorkspace();
        if (cached?.profile) {
          hydrateFromSync(cached);
          setProfile({ fullName: cached.profile.full_name || "", email: cached.profile.email || "", phone: cached.profile.phone_number || "" });
          setOffline(true);
        } else {
          setProfile(null);
          setAuthMode("welcome");
        }
      }
      if (active) setProfileLoaded(true);
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const guard = async (fn: () => Promise<void>) => {
    if (!cloud) {
      Alert.alert("Supabase connection required", "Set EXPO_PUBLIC_API_URL and connect to the Supabase backed API before saving financial data.");
      return false;
    }
    if (offline) {
      Alert.alert("Offline snapshot", "Your cached finances are available to view. Reconnect and tap the offline banner to sync before making changes.");
      return false;
    }
    try { await fn(); return true; } catch (e: any) { Alert.alert("Something went wrong", e?.message || "Please try again."); return false; }
  };

  // ---------- custom SQL auth via REST API (Supabase Auth is not used) ----------
  const signUp = async (value: UserProfile, password: string) => {
    if (!cloud) { setAuthError("The API is not configured. Set EXPO_PUBLIC_API_URL to sign up."); return; }
    if (authBusy) return;
    setAuthError("");
    setAuthInfo("");
    setAuthBusy(true);
    try {
      const result = await rest.apiRegister(value.fullName, value.phone, value.email, password, value.currency || "INR");
      if (result.verificationRequired) {
        setAuthEmail(value.email);
        setAuthInfo("Account created. Check your email and verify the address before signing in.");
        setAuthMode("login");
      } else if (result.user) {
        setProfile({ fullName: result.user.fullName, email: result.user.email, phone: result.user.phone });
        setCurrency(value.currency || "INR");
        await refreshCloud();
        notify("Account created", `Welcome, ${value.fullName.split(" ")[0]}!`);
      }
    } catch (error: any) {
      setAuthError(error?.message || "We couldn't create your account. Please try again.");
    } finally { setAuthBusy(false); }
  };

  const signIn = async (email: string, password: string) => {
    if (!cloud) { setAuthError("The API is not configured. Set EXPO_PUBLIC_API_URL to sign in."); return; }
    if (authBusy) return;
    setAuthError("");
    setAuthInfo("");
    setAuthBusy(true);
    try {
      const user = await rest.apiLogin(email, password);
      setProfile({ fullName: user.fullName, email: user.email, phone: user.phone });
      await refreshCloud();
    } catch (error: any) {
      setAuthError(error?.message || "We couldn't sign you in. Please try again.");
    } finally { setAuthBusy(false); }
  };

  const resetPassword = (_email: string) => guard(async () => {
    const email = _email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
    await rest.apiRequestPasswordReset(email);
    setAuthEmail(email);
    setAuthInfo("If an account exists for that email, a password reset link has been sent.");
    setAuthMode("login");
  });
  const resendVerification = async (email: string) => {
    try {
      await rest.apiResendVerification(email.trim().toLowerCase());
      setAuthInfo("If your account needs verification, a new link has been sent.");
      setAuthError("");
    } catch (error: any) { setAuthError(error?.message || "Could not send a verification link."); }
  };

  const logout = async () => {
    subpageHistory.current = []; subpageRef.current = ""; setSubpageState(""); setMoreOpen(false);
    setAuthError("");
    setAuthInfo("");
    setOffline(false);
    if (cloud) { await rest.apiLogout(); setProfile(null); setAuthMode("welcome"); }
    else { setProfile(null); setAuthMode("welcome"); }
  };
  const deleteAccount = async () => {
    if (!cloud) { Alert.alert("Connection required", "Sign in to the server before deleting your account."); return; }
    if (offline) { Alert.alert("Connection required", "Reconnect to the server before scheduling account deletion."); return; }
    try {
      await rest.apiDeleteAccount();
      await rest.apiLogout();
      setProfile(null);
      setAuthMode("welcome");
      Alert.alert("Deletion scheduled", "Your account is locked and scheduled for permanent deletion in 7 days. Sign in again within 7 days to cancel.");
    } catch (error: any) {
      Alert.alert("Could not schedule deletion", error?.message || "Please try again.");
    }
  };

  const updateProfile = (patch: { fullName?: string }) => guard(async () => {
    if (cloud) await rest.apiUpdateProfile(patch);
    setProfile((current) => current ? { ...current, ...patch } : current);
    notify("Profile updated", "Your profile changes were saved.");
  });
  const updateMonthlyIncome = (amount: number, incomeCurrency: string) => guard(async () => {
    if (!Number.isFinite(amount) || amount < 0 || !/^[A-Z]{3}$/.test(incomeCurrency)) throw new Error("Enter a valid monthly amount and three-letter currency code.");
    if (cloud) await rest.apiUpdateProfile({ monthlyIncome: amount, monthlyIncomeCurrency: incomeCurrency });
    setMonthlyIncome(amount);
    setMonthlyIncomeCurrency(incomeCurrency);
    notify("Income updated", `${amount.toLocaleString()} ${incomeCurrency} per month`);
  });

  // ---------- quick add ----------
  const quickAdd = (input: QuickInput) => guard(async () => {
    const val = input.amount;
    if (!input.name.trim() || !val || val <= 0) { Alert.alert("Check your entry", "Enter a name and an amount greater than zero."); return; }
    const id = String(Date.now());
    if (cloud) {
      const date = input.date || iso(0);
      if (input.kind === "Expense" || input.kind === "Income" || input.kind === "Transfer") {
        if (!accounts.length) throw new Error("Add an account before recording transactions.");
        const sourceId = input.accountId || accounts[0].id;
        const dest = input.kind === "Transfer" ? accounts.find((a) => a.id === input.toAccountId) : undefined;
        if (input.kind === "Transfer" && !dest) throw new Error("A transfer needs two accounts. Add another account first.");
        const source = accounts.find((a) => a.id === sourceId);
        await rest.apiCreate("transactions", {
          account_id: sourceId, to_account_id: dest?.id || null, type: input.kind.toLowerCase(), amount: val,
          currency: source?.currency || currency,
          ...(dest ? { to_amount: dest.currency === source?.currency ? val : Number(input.toAmount || 0), exchange_rate: input.exchangeRate } : {}),
          category: input.extra || (input.kind === "Transfer" ? "Transfer" : "Other"), title: input.name.trim(), description: input.name.trim(), note: input.note || "", date,
        });
      } else if (input.kind === "Due") await rest.apiCreate("dues", { person_name: input.name.trim(), amount: val, currency: input.currency || currency, paid_amount: 0, direction: input.extra === "Owed to me" ? "owed_to_me" : "i_owe", due_date: input.date || iso(30) });
      else if (input.kind === "Bill") await rest.apiCreate("bills", { name: input.name.trim(), amount: val, currency: input.currency || accounts.find((a) => a.id === input.accountId)?.currency || currency, frequency: (input.extra || "Monthly").toLowerCase(), next_due_date: input.date || iso(7), account_id: input.accountId || accounts[0]?.id, status: "upcoming" });
      else if (input.kind === "Goal") await rest.apiCreate("goals", { name: input.name.trim(), target_amount: val, current_amount: input.savedAmount || 0, currency: input.currency || currency, target_date: input.date || iso(365), priority: (input.priority || "Important").toLowerCase() });
      else await rest.apiCreate("investments", { asset_name: input.name.trim(), type: assetDbType[input.extra] || "other", invested_amount: val, current_value: input.currentValue ?? val, currency: input.currency || currency, purchase_date: input.date || iso(0) });
      await refreshCloud();
    } else {
      const date = input.date || iso(0);
      if (input.kind === "Expense" || input.kind === "Income" || input.kind === "Transfer") {
        const kind = input.kind === "Income" ? "income" : input.kind === "Transfer" ? "transfer" : "expense";
        setTx((x) => [{ id, title: input.name.trim(), category: input.extra || (kind === "transfer" ? "Transfer" : "Other"), amount: val, currency: accounts.find((a) => a.id === input.accountId)?.currency || currency, toAmount: input.toAmount, toCurrency: accounts.find((a) => a.id === input.toAccountId)?.currency, kind, date, accountId: input.accountId, toAccountId: input.toAccountId, toAccountName: accounts.find((a) => a.id === input.toAccountId)?.name }, ...x]);
        if (kind !== "transfer") {
          const accId = input.accountId || accounts[0]?.id;
          setAccounts((a) => a.map((acc) => (acc.id === accId ? { ...acc, balance: acc.balance + (kind === "income" ? val : -val) } : acc)));
        } else {
          const src = input.accountId || accounts[0]?.id;
          const dst = accounts.find((a) => a.id === input.toAccountId);
          setAccounts((list) => list.map((acc) => acc.id === src ? { ...acc, balance: acc.balance - val } : dst && acc.id === dst.id ? { ...acc, balance: acc.balance + (dst.currency === accounts.find((a) => a.id === src)?.currency ? val : Number(input.toAmount || 0)) } : acc));
        }
      } else if (input.kind === "Due") setDues((x) => [{ id, person: input.name.trim(), amount: val, paid: 0, currency: input.currency || currency, direction: input.extra === "Owed to me" ? "owed_to_me" : "i_owe", date: input.date || iso(30) }, ...x]);
      else if (input.kind === "Bill") setBills((x) => [{ id, name: input.name.trim(), amount: val, currency: input.currency || accounts.find((a) => a.id === input.accountId)?.currency || currency, category: "Bills", frequency: input.extra || "Monthly", date: input.date || iso(7), status: "Upcoming", accountId: input.accountId, reminderDays: input.reminderDays || 0 }, ...x]);
      else if (input.kind === "Goal") setGoals((x) => [{ id, name: input.name.trim(), target: val, saved: input.savedAmount || 0, currency: input.currency || currency, date: input.date || iso(365), priority: input.priority || "Important" }, ...x]);
      else setAssets((x) => [{ id, name: input.name.trim(), type: input.extra || "Mutual fund", invested: val, value: input.currentValue ?? val, currency: input.currency || currency }, ...x]);
    }
    setQuickOpen(false);
    notify(`${input.kind} added`, `${input.name.trim()} · ${val.toLocaleString("en-IN")}`);
  });

  // ---------- spend ----------
  const deleteTx = (id: string) => guard(async () => {
    if (cloud) { await rest.apiDelete("transactions", id); await refreshCloud(); } else setTx((x) => x.filter((t) => t.id !== id));
    setSubpage(""); notify("Transaction deleted", "It has been removed from your history.");
  });
  const editTx = (id: string, patch: { title: string; amount: number; category: string; date: string; note: string; toAmount?: number; exchangeRate?: number }) => guard(async () => {
    if (cloud) { await rest.apiUpdate("transactions", id, { title: patch.title, description: patch.title, note: patch.note, amount: patch.amount, category: patch.category, date: patch.date, to_amount: patch.toAmount, exchange_rate: patch.exchangeRate }); await refreshCloud(); }
    else setTx((x) => x.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    setSubpage(""); notify("Transaction updated", patch.title);
  });
  const addAccount = (input: { name: string; type: string; balance: number; currency: string; institution_name?: string; account_mask?: string | null }) => guard(async () => {
    if (cloud) { await rest.apiCreate("accounts", input); await refreshCloud(); }
    else setAccounts((a) => [...a, { id: String(Date.now()), name: input.name, type: input.type, balance: input.balance, currency: input.currency, institutionName: input.institution_name || null, accountMask: input.account_mask || null }]);
    notify("Account added", `${input.name} · ${input.balance.toLocaleString("en-IN")}`);
  });
  const updateAccount = (id: string, input: { name: string; type: string; balance: number; currency: string; institution_name?: string; account_mask?: string | null }) => guard(async () => {
    if (cloud) { await rest.apiUpdate("accounts", id, input); await refreshCloud(); }
    else setAccounts((items) => items.map((account) => account.id === id ? { ...account, name: input.name, type: input.type, balance: input.balance, currency: input.currency, institutionName: input.institution_name ? input.institution_name : null, accountMask: input.account_mask || null } : account));
    notify("Account updated", input.name);
  });
  const reconcileAccount = (id: string, actualBalance: number, note: string) => guard(async () => {
    if (!Number.isFinite(actualBalance)) throw new Error("Enter a valid actual balance.");
    if (cloud) await rest.apiReconcileAccount(id, actualBalance, note.trim());
    else setAccounts((items) => items.map((account) => account.id === id ? { ...account, balance: actualBalance } : account));
    await refreshCloud();
    notify("Balance reconciled", accounts.find((account) => account.id === id)?.name || "Account balance updated");
  });
  const removeAccount = (id: string) => guard(async () => {
    const account = accounts.find((item) => item.id === id);
    if (cloud) { await rest.apiDelete("accounts", id); await refreshCloud(); }
    else {
      setAccounts((items) => items.filter((item) => item.id !== id));
      setTx((items) => items.filter((item) => item.accountId !== id));
      setBills((items) => items.map((bill) => bill.accountId === id ? { ...bill, accountId: undefined } : bill));
    }
    notify("Account deleted", account?.name || "The account and its linked transactions were removed.");
  });

  // ---------- due ----------
  const payDue = (dueId: string, amount: number, note: string) => guard(async () => {
    if (cloud) {
      await rest.apiCreate("due_payments", { due_id: dueId, amount, currency: dues.find((d) => d.id === dueId)?.currency || currency, note, date: iso(0) });
      await refreshCloud();
    }
    else {
      setDues((list) => list.map((d) => (d.id === dueId ? { ...d, paid: d.paid + amount } : d)));
      setDuePayments((p) => ({ ...p, [dueId]: [{ id: String(Date.now()), amount, currency: dues.find((d) => d.id === dueId)?.currency || currency, note, date: iso(0) }, ...(p[dueId] || [])] }));
    }
    notify("Payment recorded", `${amount.toLocaleString("en-IN")} logged against this due.`);
  });
  const deleteDue = (id: string) => guard(async () => {
    if (cloud) { await rest.apiDelete("dues", id); await refreshCloud(); } else setDues((x) => x.filter((d) => d.id !== id));
    setSubpage(""); notify("Due removed", "The record was deleted.");
  });

  // ---------- invest ----------
  const updateAsset = (id: string, value: number) => guard(async () => {
    if (cloud) { await rest.apiUpdate("investments", id, { current_value: value }); await refreshCloud(); }
    else setAssets((a) => a.map((x) => (x.id === id ? { ...x, value } : x)));
    notify("Portfolio refreshed", "Current value updated.");
  });
  const deleteAsset = (id: string) => guard(async () => {
    if (cloud) { await rest.apiDelete("investments", id); await refreshCloud(); } else setAssets((x) => x.filter((a) => a.id !== id));
    setSubpage(""); notify("Investment removed", "The asset was deleted.");
  });
  const logInvestmentTx = (assetId: string, type: string, amount: number, date: string) => guard(async () => {
    const asset = assets.find((x) => x.id === assetId);
    if (cloud) {
      await rest.apiRecordInvestmentTransaction(assetId, { type, amount, currency: asset?.currency || currency, date });
      await refreshCloud();
    }
    else {
      setInvTx((m) => ({ ...m, [assetId]: [{ id: String(Date.now()), type, amount, currency: asset?.currency || currency, date }, ...(m[assetId] || [])] }));
      setAssets((a) => a.map((x) => (x.id === assetId ? { ...x, invested: type === "sell" ? Math.max(0, x.invested - amount) : ["buy", "sip"].includes(type) ? x.invested + amount : x.invested, value: type === "sell" ? Math.max(0, x.value - amount) : ["buy", "sip"].includes(type) ? x.value + amount : x.value } : x)));
    }
    notify("Investment activity logged", `${type.toUpperCase()} · ${amount.toLocaleString("en-IN")}`);
  });

  // ---------- goal ----------
  const contributeGoal = (goalId: string, amount: number) => guard(async () => {
    if (cloud) {
      await rest.apiContributeGoal(goalId, amount, "", goals.find((g) => g.id === goalId)?.currency || currency);
      await refreshCloud();
    }
    else setGoals((g) => g.map((x) => (x.id === goalId ? { ...x, saved: x.saved + amount } : x)));
    notify("Contribution added", `${amount.toLocaleString("en-IN")} moved into your goal.`);
  });
  const cyclePriority = (goalId: string) => guard(async () => {
    const order: Priority[] = ["Essential", "Important", "Flexible"];
    const current = goals.find((g) => g.id === goalId);
    const next = order[(order.indexOf((current?.priority || "Important") as Priority) + 1) % 3];
    if (cloud) { await rest.apiUpdate("goals", goalId, { priority: next.toLowerCase() }); await refreshCloud(); }
    else setGoals((g) => g.map((x) => (x.id === goalId ? { ...x, priority: next } : x)));
  });
  const setPriority = (goalId: string, p: Priority) => guard(async () => {
    if (cloud) { await rest.apiUpdate("goals", goalId, { priority: p.toLowerCase() }); await refreshCloud(); }
    else setGoals((g) => g.map((x) => (x.id === goalId ? { ...x, priority: p } : x)));
    notify("Priority updated", `Plan recalculated — ${p.toLowerCase()} goals are funded first.`);
  });
  const deleteGoal = (id: string) => guard(async () => {
    if (cloud) { await rest.apiDelete("goals", id); await refreshCloud(); } else setGoals((x) => x.filter((g) => g.id !== id));
    setSubpage(""); notify("Goal deleted", "Planning analysis recalculated.");
  });

  // ---------- bill ----------
  const markBillPaid = (bill: Bill, amount: number, createExpense: boolean) => guard(async () => {
    if (billPaymentLocks.current.has(bill.id)) return;
    billPaymentLocks.current.add(bill.id);
    try {
      if (cloud) {
        const paidOn = iso(0);
        await rest.apiPayBill(bill.id, {
          due_date: bill.date, amount, paid_on: paidOn, create_expense: createExpense,
          idempotency_key: `${bill.id}:${bill.date}:${Date.now()}`,
        });
        await refreshCloud();
      } else {
      const paidAlready = (billPayments[bill.id] || []).filter((p) => p.date === bill.date).reduce((sum, p) => sum + p.amount, 0);
      const complete = paidAlready + amount >= bill.amount;
      setBills((x) => x.map((b) => (b.id === bill.id ? { ...b, status: "Upcoming", date: complete ? nextBillDate(b.date, b.frequency) : b.date } : b)));
      if (bill.accountId) setAccounts((a) => a.map((acc) => (acc.id === bill.accountId ? { ...acc, balance: acc.balance - amount } : acc)));
      if (createExpense && bill.accountId) {
        setTx((x) => [{ id: String(Date.now()), title: bill.name, category: "Bills", amount, currency: bill.currency, kind: "expense", date: iso(0), accountId: bill.accountId }, ...x]);
      }
      setBillPayments((m) => ({ ...m, [bill.id]: [{ id: String(Date.now()), amount, date: iso(0) }, ...(m[bill.id] || [])] }));
      }
      setSubpage("");
      notify(amount >= bill.amount ? "Bill paid" : "Partial payment recorded", `${bill.name} · ${amount.toLocaleString("en-IN")} ${bill.currency} recorded.`);
    } finally {
      billPaymentLocks.current.delete(bill.id);
    }
  });
  const skipBillOccurrence = (bill: Bill) => guard(async () => {
    if (cloud) await rest.apiSkipBill(bill.id, bill.date);
    else setBills((items) => items.map((item) => item.id === bill.id ? { ...item, date: nextBillDate(item.date, item.frequency), status: "Upcoming" } : item));
    await refreshCloud();
    setSubpage("");
    notify("Bill skipped", `${bill.name} · next occurrence scheduled`);
  });
  const editBill = (id: string, patch: Partial<Bill>) => guard(async () => {
    if (cloud) { await rest.apiUpdate("bills", id, { name: patch.name, amount: patch.amount, frequency: patch.frequency?.toLowerCase(), next_due_date: patch.date, account_id: patch.accountId ?? null }); await refreshCloud(); }
    else setBills((x) => x.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    setSubpage(""); notify("Bill updated", patch.name || "Recurring payment changed.");
  });
  const deleteBill = (id: string) => guard(async () => {
    if (cloud) { await rest.apiDelete("bills", id); await refreshCloud(); } else setBills((x) => x.filter((b) => b.id !== id));
    setSubpage(""); notify("Bill removed", "The recurring payment was deleted.");
  });

  // ---------- system ----------
  const toggleTheme = () => guard(async () => {
    const next = themeName === "dark" ? "light" : "dark";
    await rest.apiUpdateProfile({ theme: next });
    setThemeName(next);
  });
  const changeCurrency = (c: string) => guard(async () => {
    await rest.apiUpdateProfile({ currency: c });
    setCurrency(c);
  });
  const saveBudget = (input: Omit<Budget, "id" | "carry_in">) => guard(async () => {
    await rest.apiCreate("budgets", input);
    await refreshCloud();
    notify("Budget saved", `${input.category} · ${input.currency} ${input.amount}`);
  });
  const saveExchangeRate = (input: { from_currency: string; to_currency: string; rate: number; effective_on: string }) => guard(async () => {
    if (!/^[A-Z]{3}$/.test(input.from_currency) || !/^[A-Z]{3}$/.test(input.to_currency) || input.from_currency === input.to_currency || !(input.rate > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(input.effective_on)) {
      throw new Error("Enter two different currency codes, a positive rate, and a valid date.");
    }
    await rest.apiCreate("exchange_rates", input);
    await refreshCloud();
    notify("Exchange rate saved", `1 ${input.from_currency} = ${input.rate} ${input.to_currency}`);
  });
  const exportData = async () => {
    if (!cloud) { Alert.alert("Supabase connection required", "Connect to the Supabase backed API before exporting financial data."); return; }
    const payload = JSON.stringify(await rest.apiSync(), null, 2);
    if (Platform.OS === "web") {
      try {
        const blob = new Blob([payload], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = "finance-copilot-export.json"; a.click();
        URL.revokeObjectURL(url);
      } catch { Alert.alert("Export", "Download blocked by the browser."); }
    } else {
      await Share.share({ title: "FinSight data backup", message: payload });
    }
    notify("Data exported", Platform.OS === "web" ? "The JSON backup was downloaded." : "The JSON backup is ready in the share sheet.");
  };
  const exportTransactionsCsv = async () => {
    if (!cloud) { Alert.alert("Connection required", "Sign in to export your transaction history."); return; }
    const rows = await rest.apiSync();
    const quote = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const columns = ["date", "type", "amount", "currency", "category", "description", "account_id", "to_account_id", "to_amount", "to_currency", "exchange_rate", "note"];
    const lines = [columns.join(","), ...(rows.transactions || []).map((tx: any) => columns.map((key) => quote(tx[key])).join(","))];
    const csv = lines.join("\n");
    if (Platform.OS === "web") {
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "finsight-transactions.csv"; a.click(); URL.revokeObjectURL(url);
    } else await Share.share({ title: "FinSight transactions CSV", message: csv });
    notify("Transactions exported", "The CSV contains each transaction's original currency.");
  };
  return {
    cloud, profile, profileLoaded, authMode, setAuthMode, authBusy, authError, setAuthError, authInfo, setAuthInfo, authEmail, setAuthEmail,
    refreshCloud,
    tab, setTab: selectTab, subpage, backLabel: subpageHistory.current[subpageHistory.current.length - 1] || tab, setSubpage, goBack, selected, setSelected, quickOpen, setQuickOpen, moreOpen, setMoreOpen, toast, setToast, notifications, setNotifications,
    currency, themeName, accounts, tx, dues, duePayments, assets, invTx, goals, bills, billPayments, billOccurrences, budgets, categories, monthlyIncome, monthlyIncomeCurrency,
    reconciliations, exchangeRates, importBatches, offline, balance, balanceByCurrency, convertedBalanceTotal, missingBalanceCurrencies,
    monthCurrencyTotals, convertedMonthSummary, rateFor, convertToBase, budgetProgress, budgetAlerts, spendByAccount, spent, income, catTotals, categoryCurrencySpent, owe, owed, investedTotal, portfolioValue, monthlyBills, availableSavings, dueThisWeek, dueThisWeekByCurrency, overdueBills,
    signUp, signIn, resetPassword, resendVerification, logout, deleteAccount,
    quickAdd, deleteTx, editTx, addAccount, updateAccount, reconcileAccount, removeAccount, payDue, deleteDue, updateAsset, deleteAsset, logInvestmentTx,
    contributeGoal, cyclePriority, setPriority, deleteGoal, markBillPaid, skipBillOccurrence, editBill, deleteBill,
    toggleTheme, changeCurrency, saveBudget, saveExchangeRate, exportData, exportTransactionsCsv, notify, updateProfile, updateMonthlyIncome,
  };
}

export type Engine = ReturnType<typeof useAppEngine>;
