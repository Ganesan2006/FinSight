import { supabase } from "./supabase";

function client() {
  if (!supabase) throw new Error("Supabase is not configured. Add the EXPO_PUBLIC keys to .env.local.");
  return supabase;
}
function raise(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}
function dateOnly(value?: string | null) {
  return value ? String(value).slice(0, 10) : new Date().toISOString().slice(0, 10);
}
const priorityLabel = (value: string) => value === "essential" ? "Essential" : value === "flexible" ? "Flexible" : "Important";
const priorityValue = (value: string) => value.toLowerCase();

export async function currentUser() {
  const db = client();
  const { data: sessionData, error: sessionError } = await db.auth.getSession();
  raise(sessionError);
  if (!sessionData.session) return null;
  const { data, error } = await db.auth.getUser();
  if (error) {
    const authError = error as any;
    if (authError.status === 401 || authError.name === "AuthSessionMissingError") {
      await db.auth.signOut({ scope: "local" });
      return null;
    }
    raise(error);
  }
  return data.user;
}

async function requireSignedInUser() {
  const user = await currentUser();
  if (!user || user.is_anonymous) throw new Error("Please sign in to continue.");
  return user.id;
}

// Minimal sign-up: create auth user → create profile + main account → stay signed in.
// No email confirmation required (disable it in Supabase → Auth → Providers → Email).
export async function signUpWithPassword(input: { fullName: string; email: string; phone: string; password: string }) {
  const db = client();
  const { data, error } = await db.auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: { full_name: input.fullName, phone_number: input.phone } },
  });
  raise(error);
  const user = data.user;
  if (!user) throw new Error("Supabase did not return the new account.");
  if (!data.session) throw new Error("Please confirm your email first, or disable email confirmation in Supabase Auth settings.");

  await saveProfile({ fullName: input.fullName, email: input.email, phone: input.phone });
  await ensureMainAccount(user.id);
  return { needsEmailConfirmation: false };
}

export async function signInWithPassword(email: string, password: string) {
  const { data, error } = await client().auth.signInWithPassword({ email, password });
  raise(error);
  if (!data.user) throw new Error("Supabase did not return a signed-in account.");
}

export async function signOut() {
  const { error } = await client().auth.signOut();
  raise(error);
}

async function saveProfile(profile: { fullName: string; email: string; phone: string }) {
  const db = client();
  const userId = await requireSignedInUser();
  const { error } = await db.from("profiles").upsert({
    id: userId,
    full_name: profile.fullName,
    email: profile.email,
    phone_number: profile.phone,
    onboarding_completed: true
  });
  raise(error);
}

async function ensureMainAccount(userId: string) {
  const db = client();
  const { data: accounts, error } = await db.from("accounts").select("id").eq("user_id", userId).limit(1);
  raise(error);
  if (!accounts?.length) {
    const { error: createAccountError } = await db.from("accounts").insert({
      user_id: userId, name: "Main account", type: "bank", balance: 0
    });
    raise(createAccountError);
  }
}

export async function loadWorkspace() {
  const db = client();
  const { data: auth, error: authError } = await db.auth.getUser();
  raise(authError);
  const signedInUser = auth.user;
  if (!signedInUser) throw new Error("The secure session has expired. Please sign in again.");
  const userId = signedInUser.id;

  const [profile, accounts, transactions, dues, investments, goals, bills, categories] = await Promise.all([
    db.from("profiles").select("*").eq("id", userId).maybeSingle(),
    db.from("accounts").select("*").eq("user_id", userId).eq("is_active", true).order("created_at"),
    db.from("transactions").select("*").eq("user_id", userId).order("date", { ascending: false }).limit(300),
    db.from("dues").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    db.from("investments").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    db.from("goals").select("*").eq("user_id", userId).order("target_date"),
    db.from("bills").select("*").eq("user_id", userId).order("next_due_date"),
    db.from("categories").select("*").eq("user_id", userId).order("name")
  ]);
  [profile, accounts, transactions, dues, investments, goals, bills, categories].forEach((result: any) => raise(result.error));

  let profileRow = profile.data;
  let accountRows = accounts.data || [];
  if (!profileRow?.onboarding_completed) {
    const fullName = signedInUser.user_metadata?.full_name || profileRow?.full_name || "";
    const phone = signedInUser.user_metadata?.phone_number || "";
    if (signedInUser.email && fullName && phone) {
      const completed = { id: userId, full_name: fullName, email: signedInUser.email, phone_number: phone, onboarding_completed: true };
      const { error } = await db.from("profiles").upsert(completed);
      raise(error);
      profileRow = completed;
    }
  }
  if (!accountRows.length) {
    const { data, error } = await db.from("accounts").insert({ user_id: userId, name: "Main account", type: "bank", balance: 0 }).select().single();
    raise(error);
    accountRows = data ? [data] : [];
  }

  return {
    profile: profileRow?.onboarding_completed ? {
      fullName: profileRow.full_name || "",
      email: profileRow.email || signedInUser.email || "",
      phone: profileRow.phone_number || ""
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

export async function addTransaction(input: { accountId: string; toAccountId?: string; type: "income" | "expense" | "transfer"; amount: number; category: string; description: string; date: string }) {
  const { data, error } = await client().rpc("create_transaction", {
    p_account_id: input.accountId,
    p_to_account_id: input.toAccountId || null,
    p_type: input.type,
    p_amount: input.amount,
    p_category: input.category,
    p_description: input.description,
    p_date: input.date
  });
  raise(error);
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
  const { data, error } = await client().rpc("mark_bill_paid", { p_bill_id: billId });
  raise(error);
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
  const { data, error } = await client().rpc("contribute_to_goal", { p_goal_id: goalId, p_amount: amount });
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
  const { error } = await db.from("profiles").update({ monthly_income: monthlyIncome }).eq("id", userId);
  raise(error);
}

export async function setProfileCurrency(currency: string) {
  const db = client(), userId = await requireSignedInUser();
  const { error } = await db.from("profiles").update({ currency }).eq("id", userId);
  raise(error);
}

export async function exportAllData() {
  const w = await loadWorkspace();
  return JSON.stringify({ exportedAt: new Date().toISOString(), version: 1, ...w }, null, 2);
}
