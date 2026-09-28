import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { hashPassword, verifyPassword, type HashedPassword } from "./crypto";

function client() {
  if (!supabase) throw new Error("Supabase is not configured. Add the EXPO_PUBLIC keys to .env.local.");
  return supabase;
}
function raise(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

// ============================================================
// Custom SQL authentication — NO supabase.auth.* calls, NO
// email verification. Users live in the plain `public.users`
// table with a bcrypt-hashed password. The signed-in user's
// id lives in AsyncStorage and every query filters on it.
// ============================================================
const SESSION_KEY = "finsight.session.user_id";

export interface AppUser { id: string; fullName: string; email: string; phone: string }

let cachedUserId: string | null | undefined; // undefined = not loaded yet

async function getSessionUserId(): Promise<string | null> {
  if (cachedUserId !== undefined) return cachedUserId;
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    cachedUserId = raw ? JSON.parse(raw) : null;
  } catch {
    cachedUserId = null;
  }
  return cachedUserId;
}

async function setSessionUserId(id: string | null) {
  cachedUserId = id;
  try {
    if (id) await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(id));
    else await AsyncStorage.removeItem(SESSION_KEY);
  } catch { /* storage unavailable */ }
}

async function requireSignedInUser(): Promise<string> {
  const id = await getSessionUserId();
  if (!id) throw new Error("Please sign in to continue.");
  return id;
}

/** Minimal sign-up: name + email + password → hashed → INSERT into public.users. */
export async function signUpWithPassword(input: { fullName: string; email: string; phone?: string; password: string }) {
  const db = client();
  const email = input.email.trim().toLowerCase();
  if (!input.fullName.trim()) throw new Error("Please enter your name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Please enter a valid email address.");
  if (input.password.length < 6) throw new Error("Password must be at least 6 characters.");

  const { data: existing, error: checkError } = await db.from("users").select("id").eq("email", email).maybeSingle();
  raise(checkError);
  if (existing) throw new Error("This email is already registered. Please log in instead.");

  const stored = await hashPassword(input.password); // plain password never leaves the device
  const { data, error } = await db
    .from("users")
    .insert({
      full_name: input.fullName.trim(),
      email,
      phone_number: input.phone?.trim() || null,
      password_algorithm: stored.algorithm,
      password_salt: stored.salt,
      password_hash: stored.hash,
      currency: "INR",
      monthly_income: 0,
    })
    .select("*")
    .single();
  if (error && /duplicate/i.test(error.message)) throw new Error("This email is already registered. Please log in instead.");
  raise(error);

  await setSessionUserId(data.id);
  return { user: rowToUser(data) };
}

/** Login: fetch the row by email, verify the bcrypt hash locally. */
export async function signInWithPassword(email: string, password: string) {
  const db = client();
  const normalized = email.trim().toLowerCase();
  const { data, error } = await db.from("users").select("*").eq("email", normalized).maybeSingle();
  raise(error);
  if (!data) throw new Error("No account found for this email. Please create one.");
  const ok = await verifyPassword(password, {
    algorithm: data.password_algorithm,
    salt: data.password_salt,
    hash: data.password_hash,
  } as HashedPassword);
  if (!ok) throw new Error("Incorrect password. Please try again.");
  await setSessionUserId(data.id);
  return { user: rowToUser(data) };
}

export async function signOut() {
  await setSessionUserId(null);
}

function rowToUser(row: any): AppUser {
  return { id: row.id, fullName: row.full_name || "", email: row.email || "", phone: row.phone_number || "" };
}

/** Restore session on app start: read saved id → SELECT profile from users. */
export async function currentUser(): Promise<AppUser | null> {
  const id = await getSessionUserId();
  if (!id) return null;
  const { data, error } = await client().from("users").select("*").eq("id", id).maybeSingle();
  if (error || !data) { await setSessionUserId(null); return null; }
  return rowToUser(data);
}
function dateOnly(value?: string | null) {
  return value ? String(value).slice(0, 10) : new Date().toISOString().slice(0, 10);
}
const priorityLabel = (value: string) => value === "essential" ? "Essential" : value === "flexible" ? "Flexible" : "Important";
const priorityValue = (value: string) => value.toLowerCase();

async function saveProfile(profile: { fullName: string; email: string; phone: string }) {
  const db = client();
  const userId = await requireSignedInUser();
  const { error } = await db.from("users").update({
    full_name: profile.fullName,
    email: profile.email.toLowerCase(),
    phone_number: profile.phone,
  }).eq("id", userId);
  raise(error);
}

export async function loadWorkspace() {
  const db = client();
  const signedInUser = await currentUser();
  if (!signedInUser) throw new Error("Your session has expired. Please sign in again.");
  const userId = signedInUser.id;

  const [profile, accounts, transactions, dues, investments, goals, bills, categories] = await Promise.all([
    db.from("users").select("*").eq("id", userId).maybeSingle(),
    db.from("accounts").select("*").eq("user_id", userId).eq("is_active", true).order("created_at"),
    db.from("transactions").select("*").eq("user_id", userId).order("date", { ascending: false }).limit(300),
    db.from("dues").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    db.from("investments").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    db.from("goals").select("*").eq("user_id", userId).order("target_date"),
    db.from("bills").select("*").eq("user_id", userId).order("next_due_date"),
    db.from("categories").select("*").eq("user_id", userId).order("name")
  ]);
  [profile, accounts, transactions, dues, investments, goals, bills, categories].forEach((result: any) => raise(result.error));

  const userRow = profile.data;
  const accountRows = accounts.data || [];
  // First login after sign-up: seed default expense/income categories.
  if (!(categories.data || []).length) {
    const { error } = await db.from("categories").insert(
      ["Food", "Shopping", "Bills", "Travel", "Health"].map((name) => ({ user_id: userId, name, type: "expense", budget_limit: 0 }))
    );
    raise(error);
  }

  return {
    profile: userRow ? {
      fullName: userRow.full_name || "",
      email: userRow.email || signedInUser.email || "",
      phone: userRow.phone_number || ""
    } : null,
    accounts: accountRows.map((a: any) => ({ id: a.id, name: a.name, type: a.type, balance: Number(a.balance) })),
    transactions: (transactions.data || []).map((t: any) => ({
      id: t.id, title: t.description || t.category, category: t.category, amount: Number(t.amount),
      kind: t.type, date: dateOnly(t.date), accountId: t.account_id
    })),
    dues: (dues.data || []).map((d: any) => ({
      id: d.id, person: d.person_name, amount: Number(d.amount), paid: Number(d.paid_amount),
      direction: d.direction, date: dateOnly(d.due_date)
    })),
    investments: (investments.data || []).map((a: any) => ({
      id: a.id, name: a.asset_name, type: ({ mutual_funds: "Mutual fund", stocks: "Stocks", gold: "Gold", fd: "FD", crypto: "Crypto", real_estate: "Real estate", other: "Other" } as Record<string,string>)[a.type] || a.type, invested: Number(a.invested_amount), value: Number(a.current_value)
    })),
    goals: (goals.data || []).map((g: any) => ({
      id: g.id, name: g.name, target: Number(g.target_amount), saved: Number(g.current_amount),
      date: dateOnly(g.target_date), priority: priorityLabel(g.priority) as "Essential" | "Important" | "Flexible"
    })),
    bills: (bills.data || []).map((b: any) => ({
      id: b.id, name: b.name, amount: Number(b.amount), frequency: b.frequency.charAt(0).toUpperCase() + b.frequency.slice(1),
      date: dateOnly(b.next_due_date), status: b.status === "paid" ? "Paid" : b.status === "overdue" ? "Overdue" : "Upcoming"
    })),
    categories: (categories.data || []).map((category: any) => ({ id: category.id, name: category.name, type: category.type, budgetLimit: Number(category.budget_limit || 0) })),
    monthlyIncome: Number(profile.data?.monthly_income || 0)
  };
}

async function adjustAccountBalance(accountId: string, delta: number) {
  const db = client();
  const { data, error } = await db.from("accounts").select("balance").eq("id", accountId).maybeSingle();
  raise(error);
  if (!data) return;
  const { error: updateError } = await db.from("accounts").update({ balance: Number(data.balance) + delta }).eq("id", accountId);
  raise(updateError);
}

export async function addTransaction(input: { userId?: string; accountId: string; toAccountId?: string; type: "income" | "expense" | "transfer"; amount: number; category: string; description: string; date: string }) {
  const db = client();
  const userId = input.userId ?? (await requireSignedInUser());
  const { data, error } = await db.from("transactions").insert({
    user_id: userId,
    account_id: input.accountId,
    to_account_id: input.type === "transfer" ? input.toAccountId || null : null,
    type: input.type,
    amount: input.amount,
    category: input.category || "Other",
    description: input.description,
    date: input.date,
  }).select("*").single();
  raise(error);
  // Keep account balances in sync with the recorded movement.
  if (input.type === "expense") await adjustAccountBalance(input.accountId, -input.amount);
  if (input.type === "income") await adjustAccountBalance(input.accountId, input.amount);
  if (input.type === "transfer") {
    await adjustAccountBalance(input.accountId, -input.amount);
    if (input.toAccountId) await adjustAccountBalance(input.toAccountId, input.amount);
  }
  const row: any = data;
  return { id: row.id, title: row.description || row.category, category: row.category, amount: Number(row.amount), kind: row.type, date: dateOnly(row.date), accountId: row.account_id };
}

export async function addDue(input: { person: string; amount: number; direction: "i_owe" | "owed_to_me"; date: string }) {
  const db = client(), userId = await requireSignedInUser();
  const { data, error } = await db.from("dues").insert({ user_id: userId, person_name: input.person, amount: input.amount, direction: input.direction, due_date: input.date }).select().single();
  raise(error);
  return { id: data.id, person: data.person_name, amount: Number(data.amount), paid: Number(data.paid_amount), direction: data.direction, date: dateOnly(data.due_date) };
}
export async function addInvestment(input: { name: string; type: string; invested: number; value: number }) {
  const db = client(), userId = await requireSignedInUser();
  const types: Record<string,string> = { "Mutual fund":"mutual_funds", Stocks:"stocks", Gold:"gold", FD:"fd" };
  const { data, error } = await db.from("investments").insert({ user_id: userId, asset_name: input.name, type: types[input.type] || "other", invested_amount: input.invested, current_value: input.value }).select().single();
  raise(error);
  return { id: data.id, name: data.asset_name, type: input.type, invested: Number(data.invested_amount), value: Number(data.current_value) };
}
export async function addGoal(input: { name: string; target: number; saved: number; date: string; priority: string }) {
  const db = client(), userId = await requireSignedInUser();
  const { data, error } = await db.from("goals").insert({ user_id: userId, name: input.name, target_amount: input.target, current_amount: input.saved, target_date: input.date, priority: priorityValue(input.priority) }).select().single();
  raise(error);
  return { id: data.id, name: data.name, target: Number(data.target_amount), saved: Number(data.current_amount), date: dateOnly(data.target_date), priority: priorityLabel(data.priority) as "Essential" | "Important" | "Flexible" };
}
export async function addBill(input: { name: string; amount: number; frequency: string; date: string; accountId?: string }) {
  const db = client(), userId = await requireSignedInUser();
  const frequency = input.frequency.toLowerCase();
  const { data, error } = await db.from("bills").insert({ user_id: userId, name: input.name, amount: input.amount, account_id: input.accountId || null, frequency: ["weekly","monthly","quarterly","yearly"].includes(frequency) ? frequency : "monthly", next_due_date: input.date }).select().single();
  raise(error);
  return { id: data.id, name: data.name, amount: Number(data.amount), frequency: data.frequency.charAt(0).toUpperCase() + data.frequency.slice(1), date: dateOnly(data.next_due_date), status: data.status === "paid" ? "Paid" : data.status === "overdue" ? "Overdue" : "Upcoming" };
}
export async function markBillPaid(billId: string) {
  const db = client();
  const userId = await requireSignedInUser();
  const { data: bill, error: fetchError } = await db.from("bills").select("*").eq("id", billId).maybeSingle();
  raise(fetchError);
  if (!bill) throw new Error("Bill not found.");
  // Log the payment and advance the next due date by one frequency period.
  const { error: payError } = await db.from("bill_payments").insert({ user_id: userId, bill_id: billId, amount: Number(bill.amount), paid_at: new Date().toISOString() });
  raise(payError);
  const next = new Date(bill.next_due_date);
  const step = bill.frequency === "weekly" ? 7 : bill.frequency === "quarterly" ? 91 : bill.frequency === "yearly" ? 365 : 30;
  next.setDate(next.getDate() + step);
  const { data, error } = await db.from("bills").update({
    status: "upcoming",
    last_paid_date: new Date().toISOString().slice(0, 10),
    next_due_date: next.toISOString().slice(0, 10),
  }).eq("id", billId).select("*").single();
  raise(error);
  if (bill.account_id) await adjustAccountBalance(bill.account_id, -Number(bill.amount));
  const row: any = data;
  return { id: row.id, name: row.name, amount: Number(row.amount), frequency: row.frequency.charAt(0).toUpperCase() + row.frequency.slice(1), date: dateOnly(row.next_due_date), status: row.status === "paid" ? "Paid" : row.status === "overdue" ? "Overdue" : "Upcoming" };
}
export async function changeGoalPriority(goalId: string, priority: string) {
  const { error } = await client().from("goals").update({ priority: priorityValue(priority) }).eq("id", goalId);
  raise(error);
}
export async function createAccount(input: { name: string; type: string; balance: number }) {
  const db = client(), userId = await requireSignedInUser();
  const type = ["bank","cash","credit"].includes(input.type) ? input.type : "bank";
  const { data, error } = await db.from("accounts").insert({ user_id: userId, name: input.name, type, balance: input.balance }).select().single();
  raise(error);
  return { id: data.id, name: data.name, type: data.type, balance: Number(data.balance) };
}

// ---------- extended SaaS operations ----------
export async function updateTransaction(id: string, patch: { amount?: number; category?: string; description?: string; date?: string }) {
  const fields: Record<string, any> = {};
  if (patch.amount !== undefined) fields.amount = patch.amount;
  if (patch.category !== undefined) fields.category = patch.category;
  if (patch.description !== undefined) fields.description = patch.description;
  if (patch.date !== undefined) fields.date = patch.date;
  const { error } = await client().from("transactions").update(fields).eq("id", id);
  raise(error);
}

export async function deleteTransaction(id: string) {
  const { error } = await client().from("transactions").delete().eq("id", id);
  raise(error);
}

export async function recordDuePayment(dueId: string, amount: number, note?: string) {
  const db = client(), userId = await requireSignedInUser();
  const { error: payError } = await db.from("due_payments").insert({ due_id: dueId, user_id: userId, amount, note: note || "", date: new Date().toISOString().slice(0, 10) });
  raise(payError);
  // A DB trigger keeps dues.paid_amount in sync with the payment ledger.
  const { data: row, error } = await db.from("dues").select("*").eq("id", dueId).single();
  raise(error);
  return row as any;
}

export async function loadDuePayments(dueId: string) {
  const { data, error } = await client().from("due_payments").select("*").eq("due_id", dueId).order("date", { ascending: false });
  raise(error);
  return (data || []).map((p: any) => ({ id: p.id, amount: Number(p.amount), note: p.note || "", date: dateOnly(p.date) }));
}

export async function updateDue(id: string, patch: { person_name?: string; amount?: number; due_date?: string; note?: string }) {
  const { error } = await client().from("dues").update(patch).eq("id", id);
  raise(error);
}

export async function deleteDue(id: string) {
  const { error } = await client().from("dues").delete().eq("id", id);
  raise(error);
}

export async function updateInvestment(id: string, patch: { asset_name?: string; invested_amount?: number; current_value?: number }) {
  const { error } = await client().from("investments").update(patch).eq("id", id);
  raise(error);
}

export async function deleteInvestment(id: string) {
  const { error } = await client().from("investments").delete().eq("id", id);
  raise(error);
}

export async function addInvestmentTransaction(investmentId: string, input: { type: "buy" | "sip" | "sell" | "dividend"; amount: number; units?: number; date: string }) {
  const db = client(), userId = await requireSignedInUser();
  const { error } = await db.from("investment_transactions").insert({ investment_id: investmentId, user_id: userId, type: input.type, amount: input.amount, units: input.units || 0, date: input.date });
  raise(error);
}

export async function loadInvestmentTransactions(investmentId: string) {
  const { data, error } = await client().from("investment_transactions").select("*").eq("investment_id", investmentId).order("date", { ascending: false });
  raise(error);
  return (data || []).map((t: any) => ({ id: t.id, type: t.type, amount: Number(t.amount), date: dateOnly(t.date) }));
}

export async function contributeToGoal(goalId: string, amount: number) {
  const db = client();
  const { data: goal, error: fetchError } = await db.from("goals").select("*").eq("id", goalId).maybeSingle();
  raise(fetchError);
  if (!goal) throw new Error("Goal not found.");
  const { data, error } = await db.from("goals").update({
    current_amount: Number(goal.current_amount) + amount,
  }).eq("id", goalId).select("*").single();
  raise(error);
  const row: any = data;
  return { id: row.id, name: row.name, target: Number(row.target_amount), saved: Number(row.current_amount), date: dateOnly(row.target_date), priority: priorityLabel(row.priority) as "Essential" | "Important" | "Flexible" };
}

export async function updateGoal(id: string, patch: { name?: string; target_amount?: number; target_date?: string }) {
  const fields: Record<string, any> = {};
  if (patch.name !== undefined) fields.name = patch.name;
  if (patch.target_amount !== undefined) fields.target_amount = patch.target_amount;
  if (patch.target_date !== undefined) fields.target_date = patch.target_date;
  const { error } = await client().from("goals").update(fields).eq("id", id);
  raise(error);
}

export async function deleteGoal(id: string) {
  const { error } = await client().from("goals").delete().eq("id", id);
  raise(error);
}

export async function updateBill(id: string, patch: { name?: string; amount?: number; frequency?: string; next_due_date?: string; account_id?: string | null; reminder_days?: number }) {
  const fields: Record<string, any> = {};
  if (patch.name !== undefined) fields.name = patch.name;
  if (patch.amount !== undefined) fields.amount = patch.amount;
  if (patch.frequency !== undefined) fields.frequency = patch.frequency.toLowerCase();
  if (patch.next_due_date !== undefined) fields.next_due_date = patch.next_due_date;
  if (patch.account_id !== undefined) fields.account_id = patch.account_id;
  if (patch.reminder_days !== undefined) fields.reminder_days = patch.reminder_days;
  const { error } = await client().from("bills").update(fields).eq("id", id);
  raise(error);
}

export async function deleteBill(id: string) {
  const { error } = await client().from("bills").delete().eq("id", id);
  raise(error);
}

export async function setProfileMonthlyIncome(monthlyIncome: number) {
  const db = client(), userId = await requireSignedInUser();
  const { error } = await db.from("users").update({ monthly_income: monthlyIncome }).eq("id", userId);
  raise(error);
}

export async function setProfileCurrency(currency: string) {
  const db = client(), userId = await requireSignedInUser();
  const { error } = await db.from("users").update({ currency }).eq("id", userId);
  raise(error);
}

export async function exportAllData() {
  const w = await loadWorkspace();
  return JSON.stringify({ exportedAt: new Date().toISOString(), version: 1, ...w }, null, 2);
}
