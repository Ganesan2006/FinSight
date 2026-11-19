// ============================================================
// REST client — the ONLY bridge between the React Native app
// (frontend) and the Express API (backend/server.js).
//   Set EXPO_PUBLIC_API_URL in app/.env.local, e.g.
//     EXPO_PUBLIC_API_URL=http://192.168.1.5:4000   (LAN device)
//     EXPO_PUBLIC_API_URL=http://localhost:4000     (web sim)
// When no URL is configured, authentication and data operations
// stay unavailable. An authenticated workspace snapshot is cached for read-only
// access during an API outage; mutations always require the live backend.
// ============================================================

import AsyncStorage from "@react-native-async-storage/async-storage";

const API_URL = (process.env.EXPO_PUBLIC_API_URL || "").replace(/\/+$/, "");
export const isApiConfigured = Boolean(API_URL);

const TOKEN_KEY = "finsight.api.token";
const WORKSPACE_CACHE_KEY = "finsight.api.workspace.v1";
let tokenCache: string | null | undefined;

export interface SubscriptionPlan {
  id: "free" | "plus" | "pro";
  name: string;
  price: number;
  currency: string;
  interval: string;
  description: string;
  limits: { accounts: number | null; goals: number | null };
  features: string[];
}

export interface SubscriptionRecord {
  user_id?: string;
  plan: SubscriptionPlan["id"];
  status: string;
  billing_cycle: string;
  current_period_end: string | null;
  plan_details?: SubscriptionPlan;
}

async function storage() { return AsyncStorage; }

export async function getAuthToken(): Promise<string | null> {
  if (tokenCache !== undefined) return tokenCache;
  const s = await storage();
  tokenCache = s ? await s.getItem(TOKEN_KEY) : null;
  return tokenCache;
}
export async function setAuthToken(token: string | null) {
  tokenCache = token;
  const s = await storage();
  if (!s) return;
  if (token) await s.setItem(TOKEN_KEY, token);
  else await s.removeItem(TOKEN_KEY);
}

async function request<T = any>(path: string, options: { method?: string; body?: any } = {}): Promise<T> {
  if (!isApiConfigured) throw new Error("API URL is not configured (EXPO_PUBLIC_API_URL).");
  let res: Response;
  try {
    const token = await getAuthToken();
    res = await fetch(`${API_URL}${path}`, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new Error("Cannot reach the server. Make sure it is running (npm run server) and the URL/IP is correct.");
  }
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* non-json error page */ }
  if (!res.ok) {
    const error: any = new Error((json && json.error) || `Server error ${res.status}`);
    error.status = res.status;
    error.code = json?.code;
    throw error;
  }
  return json as T;
}

// ---------- auth ----------
export interface AuthUser { id: string; fullName: string; email: string; phone: string }
export async function apiRegister(fullName: string, phone: string, email: string, password: string, currency = "INR") {
  const json = await request<{ token?: string; user?: AuthUser; verificationRequired?: boolean }>("/api/auth/register", { method: "POST", body: { fullName, phone, email, password, currency } });
  if (json.token) { await AsyncStorage.removeItem(WORKSPACE_CACHE_KEY); await setAuthToken(json.token); }
  return { user: json.user, verificationRequired: Boolean(json.verificationRequired) };
}
export async function apiLogin(email: string, password: string) {
  const json = await request<{ token: string; user: AuthUser }>("/api/auth/login", { method: "POST", body: { email, password } });
  await AsyncStorage.removeItem(WORKSPACE_CACHE_KEY);
  await setAuthToken(json.token);
  return json.user;
}
export const apiRequestPasswordReset = (email: string) =>
  request<{ ok: boolean }>("/api/auth/password-reset/request", { method: "POST", body: { email } });
export const apiResendVerification = (email: string) =>
  request<{ ok: boolean }>("/api/auth/verification/resend", { method: "POST", body: { email } });
export async function apiMe() {
  return request<AuthUser | null>("/api/auth/me");
}
export async function apiLogout() {
  await setAuthToken(null);
  await AsyncStorage.removeItem(WORKSPACE_CACHE_KEY);
}
export const apiDeleteAccount = () => request<{ ok: boolean; deletionScheduledAt: string; recoveryDays: number }>("/api/account", { method: "DELETE" });

// ---------- workspace sync ----------
export interface SyncPayload {
  profile: any; accounts: any[]; transactions: any[]; dues: any[]; investments: any[];
  goals: any[]; bills: any[]; categories: any[]; budgets: any[]; duePayments: any[]; billPayments: any[]; billOccurrences: any[]; invTx: any[];
  storage: string; offline?: boolean; reconciliations?: any[]; exchangeRates?: any[]; importBatches?: any[];
}
export async function apiSync() {
  try {
    const payload = await request<SyncPayload>("/api/sync");
    payload.offline = false;
    await AsyncStorage.setItem(WORKSPACE_CACHE_KEY, JSON.stringify(payload));
    return payload;
  } catch (error) {
    if ((error as any)?.status && Number((error as any).status) < 500) throw error;
    const cached = await AsyncStorage.getItem(WORKSPACE_CACHE_KEY);
    if (!cached) throw error;
    try { return { ...(JSON.parse(cached) as SyncPayload), offline: true, storage: "cached-read-only" }; }
    catch { throw error; }
  }
}
export async function apiCachedWorkspace() {
  const cached = await AsyncStorage.getItem(WORKSPACE_CACHE_KEY);
  if (!cached) return null;
  try { return { ...(JSON.parse(cached) as SyncPayload), offline: true, storage: "cached-read-only" }; }
  catch { return null; }
}

export interface TransactionPageFilters {
  page: number; limit?: number; startDate?: string; endDate?: string; type?: string; category?: string;
  source?: string; accountId?: string; search?: string;
}
export interface TransactionPage { data: any[]; total: number; page: number; limit: number; hasMore: boolean }
export const apiTransactionPage = (filters: TransactionPageFilters) => {
  const query = Object.entries(filters).filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join("&");
  return request<TransactionPage>(`/api/transactions/page?${query}`);
};

export interface SmsInboxMessage { id: string; sender: string; body: string; timestamp: number; timezone_offset_minutes?: number }
export interface SmsCandidate { fingerprint: string; amount: number; currency: string; type: "income" | "expense"; category: string; description: string; date: string; institution_name?: string; account_mask?: string; instrument_type?: "bank" | "credit" | "cash"; account_id?: string | null }
export interface SmsPreview { scanned: number; duplicates: number; ignored: number; candidates: SmsCandidate[] }
export interface SmsImportSummary { imported: number; duplicates: number; created_accounts: Array<{ id: string; name: string; currency: string }>; errors: Array<{ fingerprint: string; error: string }>; historyWarning?: string }
export const apiPreviewSms = (messages: SmsInboxMessage[]) => request<SmsPreview>("/api/sms/preview", { method: "POST", body: { messages } });
export const apiCommitSms = (transactions: SmsCandidate[]) =>
  request<SmsImportSummary>("/api/sms/commit", { method: "POST", body: { transactions } });
export interface CsvTransaction { fingerprint: string; row_number?: number; account_id: string; to_account_id?: string; amount: number; currency: string; to_amount?: number; to_currency?: string; exchange_rate?: number; type: "income" | "expense" | "transfer"; category: string; description: string; note?: string; date: string }
export interface CsvImportSummary { imported: number; duplicates: number; errors: Array<{ row: number; error: string }>; historyWarning?: string }
export const apiImportTransactions = (transactions: CsvTransaction[]) =>
  request<CsvImportSummary>("/api/transactions/import", { method: "POST", body: { transactions } });

// ---------- generic entity helpers ----------
export const apiCreate = (entity: string, body: any) => request(`/api/${entity}`, { method: "POST", body });
export const apiUpdate = (entity: string, id: string, patch: any) => request(`/api/${entity}/${id}`, { method: "PUT", body: patch });
export const apiDelete = (entity: string, id: string) => request(`/api/${entity}/${id}`, { method: "DELETE" });
export const apiList = (entity: string) => request<any[]>(`/api/${entity}`);
export const apiPayBill = (id: string, input: { due_date: string; amount: number; paid_on: string; create_expense: boolean; idempotency_key: string }) =>
  request(`/api/bills/${id}/pay`, { method: "POST", body: input });
export const apiRecordInvestmentTransaction = (id: string, input: { type: string; amount: number; currency: string; date: string; note?: string }) =>
  request(`/api/investments/${id}/transactions`, { method: "POST", body: input });
export const apiSkipBill = (id: string, due_date: string) => request(`/api/bills/${id}/skip`, { method: "POST", body: { due_date } });
export const apiReconcileAccount = (id: string, actual_balance: number, note: string) =>
  request(`/api/accounts/${id}/reconcile`, { method: "POST", body: { actual_balance, note } });

// ---------- profile ----------
export const apiUpdateProfile = (patch: { fullName?: string; currency?: string; monthlyIncome?: number; monthlyIncomeCurrency?: string; theme?: "dark" | "light" }) =>
  request("/api/profile", { method: "PUT", body: patch });

export const apiSourceCatalogue = () => request<any>("/api/sources/catalogue");
export const apiConnectSource = (kind: string, provider: string) => request<any>("/api/sources/connect", { method: "POST", body: { kind, provider } });
export const apiSubscriptionPlans = () => request<SubscriptionPlan[]>("/api/subscription/plans");
export const apiGetSubscription = () => request<SubscriptionRecord>("/api/subscription");
export const apiSetSubscription = (plan: SubscriptionPlan["id"]) => request<SubscriptionRecord>("/api/subscription", { method: "PUT", body: { plan } });

export const apiContributeGoal = (id: string, amount: number, note = "", currency?: string) => request(`/api/goals/${id}/contribute`, { method: "POST", body: { amount, note, currency } });
