// ============================================================
// App state: Supabase-backed with a full local fallback so the
// hackathon demo works even without project keys configured.
// ============================================================
import { useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert, Platform } from "react-native";
import { isSupabaseConfigured, supabase } from "./supabase";
import * as api from "./financeApi";
import type { Priority } from "./goalEngine";

export type Tab = "Spend" | "Due" | "Invest" | "Goal" | "Bill";
export type Kind = "Expense" | "Income" | "Transfer" | "Due" | "Bill" | "Goal" | "Investment";

export interface UserProfile { fullName: string; email: string; phone: string }
export interface Account { id: string; name: string; type: string; balance: number }
export interface Tx { id: string; title: string; category: string; amount: number; kind: "income" | "expense" | "transfer"; date: string; note?: string; accountId?: string }
export interface Due { id: string; person: string; amount: number; paid: number; direction: "i_owe" | "owed_to_me"; date: string; note?: string }
export interface DuePayment { id: string; amount: number; note: string; date: string }
export interface Asset { id: string; name: string; type: string; invested: number; value: number }
export interface InvTx { id: string; type: string; amount: number; date: string }
export interface Goal { id: string; name: string; target: number; saved: number; date: string; priority: Priority }
export interface Bill { id: string; name: string; amount: number; frequency: string; date: string; status: string; accountId?: string; reminderDays?: number }
export interface CategoryOption { id: string; name: string; type: string; budgetLimit: number }

const DEMO_KEY = "fc.demo.v1";

const iso = (offsetDays = 0) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); return d.toISOString().slice(0, 10); };

const seedDemo = () => ({
  profile: { fullName: "Aarav Kumar", email: "demo@fincopilot.app", phone: "+91 98765 43210" } as UserProfile,
  currency: "INR",
  theme: "dark" as "dark" | "light",
  accounts: [
    { id: "demo-a1", name: "HDFC Bank", type: "bank", balance: 215150 },
    { id: "demo-a2", name: "Cash Wallet", type: "cash", balance: 3500 },
    { id: "demo-a3", name: "Axis Savings", type: "bank", balance: 30000 },
    { id: "demo-a4", name: "SBI Credit Card", type: "credit", balance: -18400 },
  ] as Account[],
  tx: [
    { id: "t1", title: "Monthly salary", category: "Salary", amount: 92000, kind: "income", date: iso(-2), note: "Credit to HDFC Bank" },
    { id: "t2", title: "Groceries – BigBasket", category: "Food & Dining", amount: 1840, kind: "expense", date: iso(-1) },
    { id: "t3", title: "Cab ride to office", category: "Transport", amount: 430, kind: "expense", date: iso(-2) },
    { id: "t4", title: "Coffee & lunch", category: "Food & Dining", amount: 690, kind: "expense", date: iso(-3) },
    { id: "t5", title: "Netflix subscription", category: "Entertainment", amount: 649, kind: "expense", date: iso(-4) },
    { id: "t6", title: "Zara shopping", category: "Shopping", amount: 3200, kind: "expense", date: iso(-5) },
    { id: "t7", title: "Moved savings", category: "Transfer", amount: 10000, kind: "transfer", date: iso(-6) },
    { id: "t8", title: "Freelance payment", category: "Side income", amount: 14500, kind: "income", date: iso(-8) },
    { id: "t9", title: "Pharmacy", category: "Health", amount: 520, kind: "expense", date: iso(-9) },
    { id: "t10", title: "Fuel", category: "Transport", amount: 1200, kind: "expense", date: iso(-10) },
  ] as Tx[],
  dues: [
    { id: "d1", person: "Aarav Mehta", amount: 12000, paid: 3000, direction: "i_owe", date: iso(5), note: "Trip advance" },
    { id: "d2", person: "Maya Sharma", amount: 8500, paid: 0, direction: "owed_to_me", date: iso(12) },
    { id: "d3", person: "Education loan", amount: 180000, paid: 24000, direction: "i_owe", date: iso(45) },
    { id: "d4", person: "Client – Zenith LLC", amount: 45000, paid: 15000, direction: "owed_to_me", date: iso(20), note: "Invoice #214" },
  ] as Due[],
  duePayments: { d1: [{ id: "p1", amount: 3000, note: "UPI part payment", date: iso(-12) }], d3: [{ id: "p2", amount: 24000, note: "EMIs paid YTD", date: iso(-30) }], d4: [{ id: "p3", amount: 15000, note: "Partial settlement", date: iso(-18) }] } as Record<string, DuePayment[]>,
  assets: [
    { id: "a1", name: "Nifty 50 Index Fund", type: "Mutual fund", invested: 85000, value: 94750 },
    { id: "a2", name: "TCS shares", type: "Stocks", invested: 42000, value: 46800 },
    { id: "a3", name: "Digital gold", type: "Gold", invested: 18000, value: 19650 },
    { id: "a4", name: "12-month deposit", type: "FD", invested: 50000, value: 52750 },
  ] as Asset[],
  invTx: { a1: [{ id: "it1", type: "sip", amount: 5000, date: iso(-5) }, { id: "it2", type: "sip", amount: 5000, date: iso(-35) }] } as Record<string, InvTx[]>,
  goals: [
    { id: "g1", name: "Emergency fund", target: 300000, saved: 128000, date: iso(300), priority: "Essential" },
    { id: "g2", name: "First home down-payment", target: 1800000, saved: 320000, date: iso(900), priority: "Important" },
    { id: "g3", name: "Further education", target: 600000, saved: 85000, date: iso(540), priority: "Flexible" },
  ] as Goal[],
  bills: [
    { id: "b1", name: "Home rent", amount: 24000, frequency: "Monthly", date: iso(2), status: "Upcoming", accountId: "demo-a1", reminderDays: 3 },
    { id: "b2", name: "Electricity bill", amount: 1840, frequency: "Monthly", date: iso(0), status: "Upcoming", accountId: "demo-a1", reminderDays: 2 },
    { id: "b3", name: "Broadband internet", amount: 999, frequency: "Monthly", date: iso(8), status: "Upcoming", accountId: "demo-a1", reminderDays: 3 },
    { id: "b4", name: "Netflix", amount: 649, frequency: "Monthly", date: iso(-1), status: "Paid", accountId: "demo-a4", reminderDays: 1 },
    { id: "b5", name: "GYM membership", amount: 1500, frequency: "Monthly", date: iso(-3), status: "Upcoming", accountId: "demo-a2", reminderDays: 2 },
    { id: "b6", name: "Car insurance", amount: 14500, frequency: "Yearly", date: iso(40), status: "Upcoming", accountId: "demo-a1", reminderDays: 7 },
  ] as Bill[],
  billPayments: {} as Record<string, { id: string; amount: number; date: string }[]>,
  categories: [] as CategoryOption[],
  monthlyIncome: 92000,
});

export type DemoState = ReturnType<typeof seedDemo>;

export interface QuickInput {
  kind: Kind;
  name: string;
  amount: number;
  extra: string;          // category / direction / frequency / asset type
  priority?: Priority;
  date?: string;
  accountId?: string;
}

export function useAppEngine() {
  const cloud = isSupabaseConfigured;
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [authMode, setAuthMode] = useState<"welcome" | "login" | "signup" | "reset">("welcome");
  const [authBusy, setAuthBusy] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [tab, setTab] = useState<Tab>("Spend");
  const [subpage, setSubpage] = useState<string>("");
  const [selected, setSelected] = useState<any>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [toast, setToast] = useState<string>("");
  const [notifications, setNotifications] = useState<{ id: string; title: string; body: string; time: string; read: boolean }[]>([]);

  const demoRef = useRef<DemoState>(seedDemo());
  const [demoVersion, setDemoVersion] = useState(0);
  const bump = () => setDemoVersion((v) => v + 1);
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
  const [billPayments, setBillPayments] = useState<Record<string, { id: string; amount: number; date: string }[]>>({});
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [monthlyIncome, setMonthlyIncome] = useState(0);

  const notify = (title: string, body: string) => {
    setNotifications((n) => [{ id: String(Date.now()), title, body, time: "Just now", read: false }, ...n].slice(0, 40));
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

  const loadDemo = async () => {
    try {
      const raw = await AsyncStorage.getItem(DEMO_KEY);
      if (raw) demoRef.current = { ...seedDemo(), ...JSON.parse(raw) };
    } catch { /* fresh seed */ }
    const d = demoRef.current;
    setCurrency(d.currency);
    setThemeName(d.theme);
    hydrate({ profile: d.profile, accounts: d.accounts, transactions: d.tx, dues: d.dues, investments: d.assets, goals: d.goals, bills: d.bills, categories: d.categories, monthlyIncome: d.monthlyIncome });
    setDuePayments(d.duePayments);
    setInvTx(d.invTx);
    setBillPayments(d.billPayments);
    setProfileLoaded(true);
  };

  const saveDemo = async () => {
    const d = demoRef.current;
    d.currency = currency; d.theme = themeName;
    d.profile = profile || d.profile;
    d.accounts = accounts; d.tx = tx; d.dues = dues; d.duePayments = duePayments;
    d.assets = assets; d.invTx = invTx; d.goals = goals; d.bills = bills;
    d.billPayments = billPayments; d.categories = categories; d.monthlyIncome = monthlyIncome;
    try { await AsyncStorage.setItem(DEMO_KEY, JSON.stringify(d)); } catch { /* storage unavailable */ }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      if (!cloud) { await loadDemo(); return; }
      try {
        const user = await api.currentUser();
        if (!active) return;
        if (user && !user.is_anonymous) {
          const w = await api.loadWorkspace();
          if (!active) return;
          hydrate(w); // loadWorkspace auto-creates the profile row from auth metadata — no extra screens
        }
      } catch (e: any) {
        if (active) Alert.alert("Could not load your account", e?.message || "Please sign in again.");
      } finally { if (active) setProfileLoaded(true); }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { if (!cloud && profileLoaded) saveDemo(); /* eslint-disable-next-line */ }, [demoVersion, currency, themeName, profileLoaded]);

  // ---------- derived metrics ----------
  const today = new Date();
  const balance = accounts.reduce((n, a) => n + a.balance, 0);
  const monthTx = tx.filter((t) => new Date(t.date).getMonth() === today.getMonth() && new Date(t.date).getFullYear() === today.getFullYear());
  const spent = monthTx.filter((t) => t.kind === "expense").reduce((n, t) => n + t.amount, 0);
  const income = monthlyIncome || monthTx.filter((t) => t.kind === "income").reduce((n, t) => n + t.amount, 0);
  const catTotals: [string, number][] = (() => { const o: Record<string, number> = {}; monthTx.filter((t) => t.kind === "expense").forEach((t) => (o[t.category] = (o[t.category] || 0) + t.amount)); return Object.entries(o).sort((a, b) => b[1] - a[1]); })();
  const owe = dues.filter((d) => d.direction === "i_owe").reduce((n, d) => n + Math.max(0, d.amount - d.paid), 0);
  const owed = dues.filter((d) => d.direction === "owed_to_me").reduce((n, d) => n + Math.max(0, d.amount - d.paid), 0);
  const investedTotal = assets.reduce((n, a) => n + a.invested, 0);
  const portfolioValue = assets.reduce((n, a) => n + a.value, 0);
  const monthlyBills = bills.filter((b) => b.status !== "Paid").reduce((n, b) => n + b.amount * (b.frequency === "Weekly" ? 4.33 : b.frequency === "Yearly" ? 1 / 12 : b.frequency === "Quarterly" ? 1 / 3 : 1), 0);
  const availableSavings = Math.max(0, income - spent - monthlyBills);
  const dueThisWeek = bills.filter((b) => b.status !== "Paid" && new Date(b.date) <= new Date(Date.now() + 7 * 86400000) && new Date(b.date) >= new Date(iso(0))).reduce((n, b) => n + b.amount, 0);
  const overdueBills = bills.filter((b) => b.status !== "Paid" && new Date(b.date) < new Date(iso(0)));

  const refreshCloud = async () => { if (cloud) { const w = await api.loadWorkspace(); hydrate(w); } };
  const guard = async (fn: () => Promise<void>) => {
    try { await fn(); if (!cloud) bump(); } catch (e: any) { Alert.alert("Something went wrong", e?.message || "Please try again."); }
  };

  // ---------- auth (minimal: sign up → straight to dashboard) ----------
  const signUp = (value: UserProfile, password: string) => guard(async () => {
    if (!cloud) { Alert.alert("Demo mode", "Supabase keys are not configured, so this build runs fully offline with local data. Add EXPO_PUBLIC_SUPABASE_URL and ANON key to .env.local for real accounts."); return; }
    setAuthBusy(true);
    const { needsEmailConfirmation } = await api.signUpWithPassword({ ...value, password }); // creates profile + main account
    if (needsEmailConfirmation) {
      Alert.alert("Confirm your email", "We sent a confirmation link to " + value.email + ". Tap the link, then log in.");
    } else {
      const w = await api.loadWorkspace();                    // load their fresh workspace…
      hydrate(w);                                             // …and go directly to the dashboard
      notify("Account created", `Welcome, ${value.fullName.split(" ")[0]}! Tap ＋ to add your first transaction.`);
    }
    setAuthBusy(false);
  });

  const signIn = (email: string, password: string) => guard(async () => {
    if (!cloud) { Alert.alert("Demo mode", "Offline build — you are already signed in with sample data."); return; }
    setAuthBusy(true);
    await api.signInWithPassword(email, password);
    const w = await api.loadWorkspace();
    hydrate(w);
    setAuthBusy(false);
  });

  const resetPassword = (email: string) => guard(async () => {
    if (!cloud) { notify("Password reset", "Not available in offline demo mode."); return; }
    const { error } = await supabase!.auth.resetPasswordForEmail(email);
    if (error) throw error;
    notify("Reset link sent", "Check your inbox for a password reset link.");
    setAuthMode("login");
  });

  const logout = async () => {
    if (cloud) { try { await api.signOut(); } catch { /* ignore */ } }
    setProfile(null); setSubpage(""); setMoreOpen(false);
    if (!cloud) { await loadDemo(); } else setAuthMode("welcome");
  };

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
        const dest = input.kind === "Transfer" ? accounts.find((a) => a.id !== sourceId) : undefined;
        if (input.kind === "Transfer" && !dest) throw new Error("A transfer needs two accounts. Add another account first.");
        await api.addTransaction({ accountId: sourceId, toAccountId: dest?.id, type: input.kind.toLowerCase() as any, amount: val, category: input.extra || (input.kind === "Transfer" ? "Transfer" : "Other"), description: input.name.trim(), date });
      } else if (input.kind === "Due") await api.addDue({ person: input.name.trim(), amount: val, direction: input.extra === "Owed to me" ? "owed_to_me" : "i_owe", date: input.date || iso(30) });
      else if (input.kind === "Bill") await api.addBill({ name: input.name.trim(), amount: val, frequency: input.extra || "Monthly", date: input.date || iso(7), accountId: input.accountId || accounts[0]?.id });
      else if (input.kind === "Goal") await api.addGoal({ name: input.name.trim(), target: val, saved: 0, date: input.date || iso(365), priority: (input.priority || "Important").toLowerCase() });
      else await api.addInvestment({ name: input.name.trim(), type: input.extra || "Mutual fund", invested: val, value: val });
      await refreshCloud();
    } else {
      const date = input.date || iso(0);
      if (input.kind === "Expense" || input.kind === "Income" || input.kind === "Transfer") {
        const kind = input.kind === "Income" ? "income" : input.kind === "Transfer" ? "transfer" : "expense";
        setTx((x) => [{ id, title: input.name.trim(), category: input.extra || (kind === "transfer" ? "Transfer" : "Other"), amount: val, kind, date }, ...x]);
        if (kind !== "transfer") {
          const accId = input.accountId || accounts[0]?.id;
          setAccounts((a) => a.map((acc) => (acc.id === accId ? { ...acc, balance: acc.balance + (kind === "income" ? val : -val) } : acc)));
        } else {
          const src = input.accountId || accounts[0]?.id;
          const dst = accounts.find((a) => a.id !== src);
          setAccounts((list) => list.map((acc) => acc.id === src ? { ...acc, balance: acc.balance - val } : dst && acc.id === dst.id ? { ...acc, balance: acc.balance + val } : acc));
        }
      } else if (input.kind === "Due") setDues((x) => [{ id, person: input.name.trim(), amount: val, paid: 0, direction: input.extra === "Owed to me" ? "owed_to_me" : "i_owe", date: input.date || iso(30) }, ...x]);
      else if (input.kind === "Bill") setBills((x) => [{ id, name: input.name.trim(), amount: val, frequency: input.extra || "Monthly", date: input.date || iso(7), status: "Upcoming", accountId: input.accountId, reminderDays: 3 }, ...x]);
      else if (input.kind === "Goal") setGoals((x) => [{ id, name: input.name.trim(), target: val, saved: 0, date: input.date || iso(365), priority: input.priority || "Important" }, ...x]);
      else setAssets((x) => [{ id, name: input.name.trim(), type: input.extra || "Mutual fund", invested: val, value: val }, ...x]);
    }
    setQuickOpen(false);
    notify(`${input.kind} added`, `${input.name.trim()} · ${val.toLocaleString("en-IN")}`);
  });

  // ---------- spend ----------
  const deleteTx = (id: string) => guard(async () => {
    if (cloud) { await api.deleteTransaction(id); await refreshCloud(); } else setTx((x) => x.filter((t) => t.id !== id));
    setSubpage(""); notify("Transaction deleted", "It has been removed from your history.");
  });
  const editTx = (id: string, patch: { title: string; amount: number; category: string; date: string; note: string }) => guard(async () => {
    if (cloud) { await api.updateTransaction(id, { description: patch.title, amount: patch.amount, category: patch.category, date: patch.date }); await refreshCloud(); }
    else setTx((x) => x.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    setSubpage(""); notify("Transaction updated", patch.title);
  });
  const addAccount = (input: { name: string; type: string; balance: number }) => guard(async () => {
    if (cloud) { await api.createAccount(input); await refreshCloud(); }
    else setAccounts((a) => [...a, { id: String(Date.now()), ...input }]);
    notify("Account added", `${input.name} · ${input.balance.toLocaleString("en-IN")}`);
  });

  // ---------- due ----------
  const payDue = (dueId: string, amount: number, note: string) => guard(async () => {
    if (cloud) { await api.recordDuePayment(dueId, amount, note); const w = await api.loadWorkspace(); hydrate(w); }
    else {
      setDues((list) => list.map((d) => (d.id === dueId ? { ...d, paid: d.paid + amount } : d)));
      setDuePayments((p) => ({ ...p, [dueId]: [{ id: String(Date.now()), amount, note, date: iso(0) }, ...(p[dueId] || [])] }));
    }
    notify("Payment recorded", `${amount.toLocaleString("en-IN")} logged against this due.`);
  });
  const deleteDue = (id: string) => guard(async () => {
    if (cloud) { await api.deleteDue(id); await refreshCloud(); } else setDues((x) => x.filter((d) => d.id !== id));
    setSubpage(""); notify("Due removed", "The record was deleted.");
  });

  // ---------- invest ----------
  const updateAsset = (id: string, value: number) => guard(async () => {
    if (cloud) { await api.updateInvestment(id, { current_value: value }); await refreshCloud(); }
    else setAssets((a) => a.map((x) => (x.id === id ? { ...x, value } : x)));
    notify("Portfolio refreshed", "Current value updated.");
  });
  const deleteAsset = (id: string) => guard(async () => {
    if (cloud) { await api.deleteInvestment(id); await refreshCloud(); } else setAssets((x) => x.filter((a) => a.id !== id));
    setSubpage(""); notify("Investment removed", "The asset was deleted.");
  });
  const logInvestmentTx = (assetId: string, type: string, amount: number, date: string) => guard(async () => {
    if (cloud) { await api.addInvestmentTransaction(assetId, { type: type as any, amount, date }); }
    else {
      setInvTx((m) => ({ ...m, [assetId]: [{ id: String(Date.now()), type, amount, date }, ...(m[assetId] || [])] }));
      setAssets((a) => a.map((x) => (x.id === assetId ? { ...x, invested: type === "sell" ? Math.max(0, x.invested - amount) : x.invested + amount, value: type === "sell" ? Math.max(0, x.value - amount) : x.value + amount } : x)));
    }
    notify("Investment activity logged", `${type.toUpperCase()} · ${amount.toLocaleString("en-IN")}`);
  });

  // ---------- goal ----------
  const contributeGoal = (goalId: string, amount: number) => guard(async () => {
    if (cloud) { await api.contributeToGoal(goalId, amount); await refreshCloud(); }
    else setGoals((g) => g.map((x) => (x.id === goalId ? { ...x, saved: x.saved + amount } : x)));
    notify("Contribution added", `${amount.toLocaleString("en-IN")} moved into your goal.`);
  });
  const cyclePriority = (goalId: string) => guard(async () => {
    const order: Priority[] = ["Essential", "Important", "Flexible"];
    const current = goals.find((g) => g.id === goalId);
    const next = order[(order.indexOf((current?.priority || "Important") as Priority) + 1) % 3];
    if (cloud) { await api.changeGoalPriority(goalId, next.toLowerCase()); await refreshCloud(); }
    else setGoals((g) => g.map((x) => (x.id === goalId ? { ...x, priority: next } : x)));
  });
  const setPriority = (goalId: string, p: Priority) => guard(async () => {
    if (cloud) { await api.changeGoalPriority(goalId, p.toLowerCase()); await refreshCloud(); }
    else setGoals((g) => g.map((x) => (x.id === goalId ? { ...x, priority: p } : x)));
    notify("Priority updated", `Plan recalculated — ${p.toLowerCase()} goals are funded first.`);
  });
  const deleteGoal = (id: string) => guard(async () => {
    if (cloud) { await api.deleteGoal(id); await refreshCloud(); } else setGoals((x) => x.filter((g) => g.id !== id));
    setSubpage(""); notify("Goal deleted", "Planning analysis recalculated.");
  });

  // ---------- bill ----------
  const markBillPaid = (bill: Bill) => guard(async () => {
    if (cloud) { await api.markBillPaid(bill.id); await refreshCloud(); }
    else {
      setBills((x) => x.map((b) => (b.id === bill.id ? { ...b, status: "Paid" } : b)));
      setTx((x) => [{ id: String(Date.now()), title: bill.name, category: "Bills", amount: bill.amount, kind: "expense", date: iso(0) }, ...x]);
      setAccounts((a) => a.map((acc) => (acc.id === (bill.accountId || accounts[0]?.id) ? { ...acc, balance: acc.balance - bill.amount } : acc)));
      setBillPayments((m) => ({ ...m, [bill.id]: [{ id: String(Date.now()), amount: bill.amount, date: iso(0) }, ...(m[bill.id] || [])] }));
    }
    notify("Bill paid", `${bill.name} · ${bill.amount.toLocaleString("en-IN")} recorded.`);
  });
  const editBill = (id: string, patch: Partial<Bill>) => guard(async () => {
    if (cloud) { await api.updateBill(id, { name: patch.name, amount: patch.amount, frequency: patch.frequency, next_due_date: patch.date, account_id: patch.accountId ?? null, reminder_days: patch.reminderDays }); await refreshCloud(); }
    else setBills((x) => x.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    setSubpage(""); notify("Bill updated", patch.name || "Recurring payment changed.");
  });
  const deleteBill = (id: string) => guard(async () => {
    if (cloud) { await api.deleteBill(id); await refreshCloud(); } else setBills((x) => x.filter((b) => b.id !== id));
    setSubpage(""); notify("Bill removed", "The recurring payment was deleted.");
  });

  // ---------- system ----------
  const toggleTheme = () => setThemeName((t) => (t === "dark" ? "light" : "dark"));
  const changeCurrency = (c: string) => { setCurrency(c); if (cloud) guard(async () => { await api.setProfileCurrency(c); }); };
  const exportData = async () => {
    const payload = cloud ? await api.exportAllData() : JSON.stringify({ exportedAt: new Date().toISOString(), profile, accounts, transactions: tx, dues, duePayments, investments: assets, investmentTransactions: invTx, goals, bills, billPayments, categories, monthlyIncome, currency }, null, 2);
    if (Platform.OS === "web") {
      try {
        const blob = new Blob([payload], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = "finance-copilot-export.json"; a.click();
        URL.revokeObjectURL(url);
      } catch { Alert.alert("Export", "Download blocked by the browser."); }
    } else {
      Alert.alert("Backup ready", "Your Finance Copilot backup was generated.", [{ text: "OK" }]);
    }
    console.log("[export]", payload.slice(0, 200) + " …");
    notify("Data exported", "A JSON snapshot of your workspace was created.");
  };
  const resetDemo = () => { demoRef.current = seedDemo(); void AsyncStorage.removeItem(DEMO_KEY); void loadDemo(); notify("Workspace reset", "Sample data restored."); };

  return {
    cloud, profile, profileLoaded, authMode, setAuthMode, authBusy, authEmail, setAuthEmail,
    tab, setTab, subpage, setSubpage, selected, setSelected, quickOpen, setQuickOpen, moreOpen, setMoreOpen, toast, setToast, notifications, setNotifications,
    currency, themeName, accounts, tx, dues, duePayments, assets, invTx, goals, bills, billPayments, categories, monthlyIncome,
    balance, spent, income, catTotals, owe, owed, investedTotal, portfolioValue, monthlyBills, availableSavings, dueThisWeek, overdueBills,
    signUp, signIn, resetPassword, logout,
    quickAdd, deleteTx, editTx, addAccount, payDue, deleteDue, updateAsset, deleteAsset, logInvestmentTx,
    contributeGoal, cyclePriority, setPriority, deleteGoal, markBillPaid, editBill, deleteBill,
    toggleTheme, changeCurrency, exportData, resetDemo, notify,
  };
}

export type Engine = ReturnType<typeof useAppEngine>;
