// ============================================================
// Data access layer for the REST API.
// All application data is stored in Supabase PostgreSQL. There is no
// local JSON fallback: missing configuration is a startup error.
// ============================================================
const crypto = require("crypto");

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY; // elevated server key only — never ship this in the app
const useSupabase = Boolean(SUPABASE_URL && SUPABASE_KEY);
if (!useSupabase) throw new Error("Supabase is required. Set SUPABASE_URL and SUPABASE_SECRET_KEY in backend/.env; local JSON storage is disabled.");
if (SUPABASE_KEY.startsWith("sb_publishable_")) {
  throw new Error("backend/.env has a Supabase publishable key. Set SUPABASE_SECRET_KEY to the project's server-only sb_secret_ key (or use the legacy service_role key).");
}
if (SUPABASE_KEY.split(".").length === 3) {
  const claims = require("jsonwebtoken").decode(SUPABASE_KEY);
  if (claims?.role && claims.role !== "service_role") {
    throw new Error("backend/.env has a low-privilege Supabase key. Set SUPABASE_SECRET_KEY to the server-only key (or use the legacy service_role key).");
  }
}
const { createClient } = require("@supabase/supabase-js");
// Supabase Realtime expects the Node WebSocket transport explicitly on
// Node versions without a global WebSocket (including Node 18).
const WebSocket = require("ws");
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: WebSocket },
});
const uid = () => crypto.randomUUID();

// ---------- generic helpers ----------
async function list(table, userId) {
  const { data, error } = await sb.from(table).select("*").eq("user_id", userId).order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}
async function listTransactionPage(userId, filters = {}) {
  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(filters.limit) || 40));
  let query = sb.from("transactions").select("*", { count: "exact" }).eq("user_id", userId)
    .order("date", { ascending: false }).order("created_at", { ascending: false });
  if (filters.startDate) query = query.gte("date", filters.startDate);
  if (filters.endDate) query = query.lte("date", filters.endDate);
  if (filters.type) query = query.eq("type", filters.type);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.source) query = query.eq("source", filters.source);
  const ors = [];
  if (filters.accountId) ors.push(`or(account_id.eq.${filters.accountId},to_account_id.eq.${filters.accountId})`);
  if (filters.search) {
    const safe = String(filters.search).replace(/[\\%_,().'\"\[\]]/g, " ").trim().slice(0, 80);
    if (safe) ors.push(`or(description.ilike.%${safe}%,category.ilike.%${safe}%)`);
  }
  if (ors.length === 1) query = query.or(ors[0].slice(3, -1));
  else if (ors.length > 1) query = query.or(`and(${ors.join(",")})`);
  const from = (page - 1) * limit;
  const { data, error, count } = await query.range(from, from + limit - 1);
  if (error) throw new Error(error.message);
  return { data: data || [], total: count || 0, page, limit };
}
async function insert(table, row) {
  const full = { id: row.id || uid(), ...row };
  const { data, error } = await sb.from(table).insert(full).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}
async function upsert(table, row, onConflict) {
  const { data, error } = await sb.from(table).upsert(row, { onConflict }).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}
async function update(table, id, patch) {
  const { data, error } = await sb.from(table).update(patch).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}
async function remove(table, id) {
  const { error } = await sb.from(table).delete().eq("id", id);
  if (error) throw new Error(error.message);
  return true;
}
async function byId(table, id) {
  const { data, error } = await sb.from(table).select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
async function rpc(name, params) {
  const { data, error } = await sb.rpc(name, params);
  if (error) throw new Error(error.message);
  return data;
}

// ---------- users (custom SQL auth — no supabase.auth) ----------
async function findUserByEmail(email) {
  const { data, error } = await sb.from("users").select("*").eq("email", email.toLowerCase()).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
async function findUserByToken(column, tokenHash) {
  if (!["email_verification_token_hash", "password_reset_token_hash"].includes(column)) throw new Error("Invalid token lookup");
  const { data, error } = await sb.from("users").select("*").eq(column, tokenHash).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
async function listImportBatches(userId) {
  const { data, error } = await sb.from("import_batches").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(20);
  if (error) throw new Error(error.message);
  return data || [];
}
async function purgeDueAccounts(now = new Date().toISOString()) {
  const { data, error } = await sb.from("users").select("id").lte("deletion_scheduled_at", now);
  if (error) throw new Error(error.message);
  let deleted = 0;
  for (const user of data || []) {
    const result = await sb.from("users").delete().eq("id", user.id);
    if (result.error) throw new Error(result.error.message);
    deleted++;
  }
  return deleted;
}
async function createUser(row) { return insert("users", row); }
async function getSubscription(userId) {
  const defaults = { user_id: userId, plan: "free", status: "active", billing_cycle: "monthly", current_period_end: null };
  const { data, error } = await sb.from("subscriptions").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data || defaults;
}
async function saveSubscription(userId, patch) {
  const existing = await getSubscription(userId);
  const updated = { ...existing, ...patch, user_id: userId, updated_at: new Date().toISOString() };
  const { data, error } = await sb.from("subscriptions").upsert(updated, { onConflict: "user_id" }).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}
async function findProfile(userId) {
  const { data, error } = await sb.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
async function upsertProfile(userId, patch) {
  const existing = await findProfile(userId);
  if (existing) return update("profiles", userId, patch);
  return insert("profiles", { id: userId, ...patch });
}

module.exports = {
  useSupabase, uid,
  list, listTransactionPage, insert, upsert, update, remove, byId, rpc,
  findUserByEmail, findUserByToken, createUser, findProfile, upsertProfile, getSubscription, saveSubscription, purgeDueAccounts,
  listImportBatches,
};
