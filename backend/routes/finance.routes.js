const express = require("express");
const db = require("../db");
const { requireAuth } = require("../core/auth");
const { ownedAccount } = require("../service/accounts.service");
const { PLANS } = require("../service/catalogs");

const router = express.Router();
const isValidIsoDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

// ---------- entity registry (drives generic CRUD routes) ----------
const ENTITIES = {
  accounts: ["name", "type", "balance", "currency", "institution_name", "account_mask"],
  exchange_rates: ["from_currency", "to_currency", "rate", "effective_on"],
  transactions: ["account_id", "to_account_id", "type", "amount", "currency", "to_amount", "to_currency", "exchange_rate", "category", "date", "note", "description"],
  dues: ["person_name", "amount", "currency", "paid_amount", "direction", "due_date", "note"],
  investments: ["asset_name", "type", "currency", "invested_amount", "current_value", "purchase_date"],
  goals: ["name", "target_amount", "currency", "current_amount", "target_date", "priority"],
  bills: ["name", "amount", "currency", "category", "frequency", "next_due_date", "anchor_day", "anchor_month", "account_id", "status", "reminder_days"],
  categories: ["name", "type", "budget_limit"],
  due_payments: ["due_id", "amount", "currency", "note", "date"],
  budgets: ["category", "period_start", "amount", "currency", "rollover_enabled", "carry_in"],
  connected_sources: ["kind", "provider", "label", "status", "meta"],
};

// ============================================================
// SYNC — single call that hydrates the whole dashboard
// ============================================================
router.get("/sync", requireAuth, async (req, res) => {
  try {
    const uidv = req.user.sub;
    const [profile, accounts, transactions, dues, investments, goals, bills, categories, budgets, duePayments, billPayments, billOccurrences, invTx, goalContributions, connectedSources, reconciliations, exchangeRates, importBatches] = await Promise.all([
      db.findProfile(uidv),
      db.list("accounts", uidv),
      db.list("transactions", uidv),
      db.list("dues", uidv),
      db.list("investments", uidv),
      db.list("goals", uidv),
      db.list("bills", uidv),
      db.list("categories", uidv),
      db.list("budgets", uidv),
      db.list("due_payments", uidv),
      db.list("bill_payments", uidv),
      db.list("bill_occurrences", uidv),
      db.list("investment_transactions", uidv),
      db.list("goal_contributions", uidv),
      db.list("connected_sources", uidv),
      db.list("account_reconciliations", uidv),
      db.list("exchange_rates", uidv),
      db.listImportBatches(uidv),
    ]);
    res.json({
      profile, accounts, transactions, dues, investments, goals, bills, categories, budgets,
      duePayments, billPayments, billOccurrences, invTx, goalContributions, connectedSources,
      reconciliations, exchangeRates, importBatches,
      storage: "supabase-postgres",
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/transactions/page", requireAuth, async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));
    const startDate = String(req.query.startDate || "");
    const endDate = String(req.query.endDate || "");
    if ((startDate && !isValidIsoDate(startDate)) || (endDate && !isValidIsoDate(endDate)) || (startDate && endDate && startDate > endDate)) {
      return res.status(400).json({ error: "Choose a valid date range." });
    }
    const type = String(req.query.type || "");
    const category = String(req.query.category || "").trim().slice(0, 100);
    const source = String(req.query.source || "");
    const accountId = String(req.query.accountId || "");
    if (type && !["income", "expense", "transfer"].includes(type)) return res.status(400).json({ error: "Choose a valid transaction type." });
    if (source && !["manual", "csv", "sms", "bill_payment"].includes(source)) return res.status(400).json({ error: "Choose a valid transaction source." });
    if (accountId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(accountId)) return res.status(400).json({ error: "Choose a valid account." });
    const result = await db.listTransactionPage(req.user.sub, {
      page, limit, startDate, endDate, type, category, source,
      accountId, search: String(req.query.search || ""),
    });
    res.json({ ...result, hasMore: result.page * result.limit < result.total });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/import-batches", requireAuth, async (req, res) => {
  try { res.json(await db.listImportBatches(req.user.sub)); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/accounts/:id/reconcile", requireAuth, async (req, res) => {
  try {
    const rawBalance = req.body?.actual_balance;
    if ((typeof rawBalance !== "number" && typeof rawBalance !== "string") || String(rawBalance).trim() === "") {
      return res.status(400).json({ error: "Enter a valid actual balance." });
    }
    const actualBalance = Number(rawBalance);
    if (!Number.isFinite(actualBalance)) return res.status(400).json({ error: "Enter a valid actual balance." });
    const reconciliation = await db.rpc("reconcile_account_balance", {
      p_user_id: req.user.sub, p_account_id: req.params.id,
      p_actual_balance: actualBalance, p_note: String(req.body?.note || "").slice(0, 500),
    });
    res.json(reconciliation);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ============================================================
// GENERIC CRUD  /api/accounts /api/transactions …
// ============================================================
for (const [entity, fields] of Object.entries(ENTITIES)) {
  const table = entity; // local & sql names align

  router.get(`/${entity}`, requireAuth, async (req, res) => {
    try { res.json(await db.list(table, req.user.sub)); } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get(`/${entity}/:id`, requireAuth, async (req, res) => {
    try {
      const row = await db.byId(table, req.params.id);
      if (!row || row.user_id !== req.user.sub) return res.status(404).json({ error: "Not found" });
      res.json(row);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.post(`/${entity}`, requireAuth, async (req, res) => {
    try {
      if (table === "accounts" || table === "goals") {
        const subscription = await db.getSubscription(req.user.sub);
        const currentPlan = PLANS.find((item) => item.id === subscription.plan) || PLANS[0];
        const limit = currentPlan.limits[table];
        if (limit !== null && limit !== undefined) {
          const existing = await db.list(table, req.user.sub);
          if (existing.length >= limit) return res.status(403).json({
            code: "PLAN_LIMIT_REACHED",
            error: `${currentPlan.name} includes up to ${limit} ${table}. Paid upgrades are not available yet.`,
          });
        }
      }
      const row = { user_id: req.user.sub };
      for (const f of fields) if (req.body[f] !== undefined) row[f] = req.body[f];
      if (table === "accounts") {
        row.name = String(row.name || "").trim().slice(0, 100);
        row.type = String(row.type || "bank");
        row.currency = String(row.currency || "INR").toUpperCase();
        row.balance = Number(row.balance || 0);
        if (!row.name || !["bank", "cash", "credit"].includes(row.type) || !Number.isFinite(row.balance)) return res.status(400).json({ error: "Enter a valid account name, type, and balance." });
        if (!/^[A-Z]{3}$/.test(row.currency)) return res.status(400).json({ error: "Choose a valid three-letter currency code." });
        row.institution_name = String(row.institution_name || "").trim().slice(0, 100) || null;
        row.account_mask = row.account_mask == null || row.account_mask === "" ? null : String(row.account_mask).trim();
        if (row.account_mask !== null && !/^\d{4}$/.test(row.account_mask)) return res.status(400).json({ error: "Enter only the account's last four digits." });
      }
      if (table === "transactions") {
        row.description = row.description || req.body.title || row.category || "";
        if (!["income", "expense", "transfer"].includes(row.type)) return res.status(400).json({ error: "Choose a valid transaction type." });
        if (!isValidIsoDate(String(row.date || ""))) return res.status(400).json({ error: "Enter a valid transaction date." });
        if (!Number.isFinite(Number(row.amount)) || !(Number(row.amount) > 0)) return res.status(400).json({ error: "Amount must be a finite value greater than zero." });
        const source = await ownedAccount(row.account_id, req.user.sub);
        if (!source) return res.status(400).json({ error: "Choose an account that belongs to your profile." });
        row.currency = String(row.currency || source.currency || "INR").toUpperCase();
        if (row.currency !== String(source.currency || "INR").toUpperCase()) return res.status(400).json({ error: "Transaction currency must match its account currency." });
        if (row.type === "transfer") {
          const target = await ownedAccount(row.to_account_id, req.user.sub);
          if (!target || target.id === source.id) return res.status(400).json({ error: "Choose a different destination account." });
          row.to_currency = String(target.currency || "INR").toUpperCase();
          row.to_amount = Number(row.to_amount ?? row.amount);
          if (!Number.isFinite(row.to_amount) || !(row.to_amount > 0)) return res.status(400).json({ error: "Enter a finite amount received by the destination account." });
          if (row.to_currency !== row.currency && (!Number.isFinite(Number(row.exchange_rate)) || !(Number(row.exchange_rate) > 0))) return res.status(400).json({ error: "Enter the exchange rate for this cross-currency transfer." });
          if (row.to_currency === row.currency) row.to_amount = Number(row.amount);
        } else row.to_account_id = null;
      }
      if (table === "bills") {
        const account = row.account_id ? await ownedAccount(row.account_id, req.user.sub) : null;
        if (row.account_id && !account) return res.status(400).json({ error: "Choose an account that belongs to your profile." });
        row.currency = String(row.currency || account?.currency || "INR").toUpperCase();
        if (account && row.currency !== account.currency) return res.status(400).json({ error: "Bill currency must match the linked account currency." });
        row.category = String(row.category || "Bills").trim();
        const due = new Date(`${row.next_due_date}T00:00:00.000Z`);
        if (!row.name?.trim() || !Number.isFinite(Number(row.amount)) || !(Number(row.amount) > 0) || !isValidIsoDate(String(row.next_due_date || ""))) return res.status(400).json({ error: "Enter a bill name, valid amount, and next due date." });
        row.anchor_day = Number(row.anchor_day || due.getUTCDate());
        row.anchor_month = Number(row.anchor_month || due.getUTCMonth() + 1);
      }
      if (["dues", "investments", "goals", "due_payments", "investment_transactions", "goal_contributions"].includes(table)) {
        let parentCurrency;
        if (table === "due_payments") {
          const due = await db.byId("dues", row.due_id);
          if (!due || due.user_id !== req.user.sub) return res.status(400).json({ error: "Choose a due that belongs to your profile." });
          parentCurrency = due.currency;
        } else if (table === "investment_transactions") {
          const investment = await db.byId("investments", row.investment_id);
          if (!investment || investment.user_id !== req.user.sub) return res.status(400).json({ error: "Choose an investment that belongs to your profile." });
          parentCurrency = investment.currency;
        } else if (table === "goal_contributions") {
          const goal = await db.byId("goals", row.goal_id);
          if (!goal || goal.user_id !== req.user.sub) return res.status(400).json({ error: "Choose a goal that belongs to your profile." });
          parentCurrency = goal.currency;
        }
        row.currency = String(row.currency || parentCurrency || "INR").toUpperCase();
        if (!/^[A-Z]{3}$/.test(row.currency)) return res.status(400).json({ error: "Choose a valid three-letter currency code." });
        if (parentCurrency && row.currency !== parentCurrency) return res.status(400).json({ error: "Payment currency must match the related record." });
        if (["due_payments", "investment_transactions", "goal_contributions"].includes(table)) {
          if (!Number.isFinite(Number(row.amount)) || !(Number(row.amount) > 0)) return res.status(400).json({ error: "Enter a finite amount greater than zero." });
          row.date = String(row.date || new Date().toISOString().slice(0, 10));
          if (!isValidIsoDate(row.date)) return res.status(400).json({ error: "Enter a valid payment date." });
          if (table === "due_payments") {
            const payments = await db.list("due_payments", req.user.sub);
            const alreadyPaid = payments.filter((item) => item.due_id === row.due_id).reduce((sum, item) => sum + Number(item.amount), 0);
            const due = await db.byId("dues", row.due_id);
            if (alreadyPaid + Number(row.amount) > Number(due?.amount || 0)) return res.status(400).json({ error: "Payment cannot exceed the remaining due amount." });
          }
        }
      }
      if (table === "budgets") {
        row.currency = String(row.currency || "INR").toUpperCase();
        if (!row.category || !isValidIsoDate(String(row.period_start || "")) || !String(row.period_start).endsWith("-01") || !Number.isFinite(Number(row.amount)) || !(Number(row.amount) > 0)) return res.status(400).json({ error: "Choose a category, month, currency, and finite budget amount greater than zero." });
        const period = new Date(`${row.period_start}T00:00:00.000Z`);
        period.setUTCMonth(period.getUTCMonth() - 1);
        const previousStart = period.toISOString().slice(0, 10);
        const previousEnd = row.period_start;
        const [priorBudgets, transactions, payments, bills] = await Promise.all([
          db.list("budgets", req.user.sub), db.list("transactions", req.user.sub),
          db.list("bill_payments", req.user.sub), db.list("bills", req.user.sub),
        ]);
        const prior = priorBudgets.find((item) => item.category === row.category && item.currency === row.currency && item.period_start === previousStart);
        let priorSpend = transactions.filter((item) => item.type === "expense" && item.category === row.category && item.currency === row.currency && item.date >= previousStart && item.date < previousEnd).reduce((sum, item) => sum + Number(item.amount), 0);
        const billById = Object.fromEntries(bills.map((bill) => [bill.id, bill]));
        priorSpend += payments.filter((payment) => !payment.transaction_id && payment.date >= previousStart && payment.date < previousEnd && billById[payment.bill_id]?.category === row.category && payment.currency === row.currency).reduce((sum, payment) => sum + Number(payment.amount), 0);
        row.carry_in = prior?.rollover_enabled ? Number(prior.carry_in || 0) + Number(prior.amount) - priorSpend : 0;
      }
      if (table === "exchange_rates") {
        row.from_currency = String(row.from_currency || "").toUpperCase();
        row.to_currency = String(row.to_currency || "").toUpperCase();
        row.rate = Number(row.rate);
        row.effective_on = String(row.effective_on || "");
        if (!/^[A-Z]{3}$/.test(row.from_currency) || !/^[A-Z]{3}$/.test(row.to_currency)
          || row.from_currency === row.to_currency || !Number.isFinite(row.rate) || !(row.rate > 0) || !isValidIsoDate(row.effective_on)) {
          return res.status(400).json({ error: "Enter two different currency codes, a positive rate, and a valid effective date." });
        }
      }
      if (["dues", "investments", "goals"].includes(table) && patch.currency !== undefined) {
        const nextCurrency = String(patch.currency || "").toUpperCase();
        if (!/^[A-Z]{3}$/.test(nextCurrency)) return res.status(400).json({ error: "Choose a valid three-letter currency code." });
        if (nextCurrency !== row.currency) {
          const childrenTable = table === "dues" ? "due_payments" : table === "investments" ? "investment_transactions" : "goal_contributions";
          const parentField = table === "dues" ? "due_id" : table === "investments" ? "investment_id" : "goal_id";
          const children = await db.list(childrenTable, req.user.sub);
          if (children.some((item) => item[parentField] === row.id)) {
            return res.status(409).json({ error: "Currency cannot change while payment or activity history is linked to this record." });
          }
          patch.currency = nextCurrency;
        }
      }
      const created = table === "transactions"
        ? await db.rpc("mutate_financial_transaction", { p_user_id: req.user.sub, p_transaction_id: null, p_action: "create", p_row: row })
        : table === "budgets"
          ? await db.upsert(table, row, "user_id,category,period_start,currency")
          : table === "exchange_rates"
            ? await db.upsert(table, row, "user_id,from_currency,to_currency,effective_on")
          : await db.insert(table, row);
      if (table === "bills") {
        await db.upsert("bill_occurrences", { bill_id: created.id, user_id: req.user.sub, due_date: created.next_due_date, amount: created.amount, currency: created.currency, status: "upcoming" }, "bill_id,due_date");
      }
      res.json(created);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.put(`/${entity}/:id`, requireAuth, async (req, res) => {
    try {
      const row = await db.byId(table, req.params.id);
      if (!row || row.user_id !== req.user.sub) return res.status(404).json({ error: "Not found" });
      const patch = {};
      for (const f of fields) if (req.body[f] !== undefined) patch[f] = req.body[f];
      if (table === "accounts") {
        if (patch.name !== undefined) patch.name = String(patch.name || "").trim().slice(0, 100);
        if (patch.type !== undefined) patch.type = String(patch.type);
        if (patch.currency !== undefined) patch.currency = String(patch.currency || "").toUpperCase();
        if (patch.balance !== undefined) patch.balance = Number(patch.balance);
        if (patch.institution_name !== undefined) patch.institution_name = String(patch.institution_name || "").trim().slice(0, 100) || null;
        if (patch.account_mask !== undefined) {
          patch.account_mask = patch.account_mask == null || patch.account_mask === "" ? null : String(patch.account_mask).trim();
          if (patch.account_mask !== null && !/^\d{4}$/.test(patch.account_mask)) return res.status(400).json({ error: "Enter only the account's last four digits." });
        }
        const nextAccount = { ...row, ...patch };
        if (!String(nextAccount.name || "").trim() || !["bank", "cash", "credit"].includes(nextAccount.type) || !Number.isFinite(Number(nextAccount.balance))) {
          return res.status(400).json({ error: "Enter a valid account name, type, and balance." });
        }
        if (!/^[A-Z]{3}$/.test(String(nextAccount.currency || ""))) return res.status(400).json({ error: "Choose a valid three-letter currency code." });
        if ((patch.currency && patch.currency !== row.currency) || (patch.type && patch.type !== row.type)) {
          const [transactions, bills] = await Promise.all([db.list("transactions", req.user.sub), db.list("bills", req.user.sub)]);
          const hasLinkedRecords = transactions.some((item) => item.account_id === row.id || item.to_account_id === row.id)
            || bills.some((item) => item.account_id === row.id);
          if (hasLinkedRecords) return res.status(409).json({ error: "Account type and currency cannot change while transactions or bills are linked to this account." });
        }
      }
      if (table === "bills") {
        const nextBill = { ...row, ...patch };
        const account = nextBill.account_id ? await ownedAccount(nextBill.account_id, req.user.sub) : null;
        if (nextBill.account_id && !account) return res.status(400).json({ error: "Choose an account that belongs to your profile." });
        nextBill.currency = String(nextBill.currency || account?.currency || "INR").toUpperCase();
        if (!/^[A-Z]{3}$/.test(nextBill.currency) || (account && nextBill.currency !== account.currency)) {
          return res.status(400).json({ error: "Bill currency must be valid and match the linked account currency." });
        }
        if (!nextBill.name?.trim() || !Number.isFinite(Number(nextBill.amount)) || !(Number(nextBill.amount) > 0)
          || !["weekly", "monthly", "quarterly", "yearly"].includes(nextBill.frequency)
          || !isValidIsoDate(String(nextBill.next_due_date || ""))) {
          return res.status(400).json({ error: "Enter a bill name, valid amount, frequency, and next due date." });
        }
        patch.currency = nextBill.currency;
        patch.account_id = nextBill.account_id || null;
      }
      if (table === "bills" && patch.category !== undefined) patch.category = String(patch.category || "Bills").trim();
      if (table === "bills" && patch.next_due_date) {
        const due = new Date(`${patch.next_due_date}T00:00:00.000Z`);
        if (!isValidIsoDate(String(patch.next_due_date))) return res.status(400).json({ error: "Enter a valid next due date." });
        patch.anchor_day = due.getUTCDate();
        patch.anchor_month = due.getUTCMonth() + 1;
      }
      if (table === "transactions") {
        const next = { ...row, ...patch };
        if (!["income", "expense", "transfer"].includes(next.type)) return res.status(400).json({ error: "Choose a valid transaction type." });
        if (!isValidIsoDate(String(next.date || ""))) return res.status(400).json({ error: "Enter a valid transaction date." });
        if (!Number.isFinite(Number(next.amount)) || !(Number(next.amount) > 0)) return res.status(400).json({ error: "Amount must be a finite value greater than zero." });
        const source = await ownedAccount(next.account_id, req.user.sub);
        if (!source) return res.status(400).json({ error: "Choose an account that belongs to your profile." });
        next.currency = String(next.currency || source.currency || "INR").toUpperCase();
        if (next.currency !== String(source.currency || "INR").toUpperCase()) return res.status(400).json({ error: "Transaction currency must match its account currency." });
        if (next.type === "transfer") {
          const target = await ownedAccount(next.to_account_id, req.user.sub);
          if (!target || next.to_account_id === next.account_id) return res.status(400).json({ error: "Choose a different destination account." });
          next.to_currency = String(target.currency || "INR").toUpperCase();
          next.to_amount = Number(next.to_amount ?? next.amount);
          if (!Number.isFinite(Number(next.to_amount)) || !(Number(next.to_amount) > 0)) return res.status(400).json({ error: "Enter a finite amount received by the destination account." });
          if (next.to_currency !== next.currency && (!Number.isFinite(Number(next.exchange_rate)) || !(Number(next.exchange_rate) > 0))) return res.status(400).json({ error: "Enter the exchange rate for this cross-currency transfer." });
          if (next.to_currency === next.currency) next.to_amount = Number(next.amount);
        }
        patch.currency = next.currency;
        patch.to_amount = next.to_amount;
        patch.to_currency = next.to_currency;
        patch.exchange_rate = next.exchange_rate;
        const updated = await db.rpc("mutate_financial_transaction", { p_user_id: req.user.sub, p_transaction_id: req.params.id, p_action: "update", p_row: next });
        return res.json(updated);
      }
      if (table === "exchange_rates") {
        const nextRate = { ...row, ...patch };
        nextRate.from_currency = String(nextRate.from_currency || "").toUpperCase();
        nextRate.to_currency = String(nextRate.to_currency || "").toUpperCase();
        nextRate.rate = Number(nextRate.rate);
        nextRate.effective_on = String(nextRate.effective_on || "");
        if (!/^[A-Z]{3}$/.test(nextRate.from_currency) || !/^[A-Z]{3}$/.test(nextRate.to_currency)
          || nextRate.from_currency === nextRate.to_currency || !Number.isFinite(nextRate.rate) || !(nextRate.rate > 0)
          || !isValidIsoDate(nextRate.effective_on)) {
          return res.status(400).json({ error: "Enter two different currency codes, a positive rate, and a valid effective date." });
        }
        patch.from_currency = nextRate.from_currency;
        patch.to_currency = nextRate.to_currency;
        patch.rate = nextRate.rate;
        patch.effective_on = nextRate.effective_on;
      }
      if (["due_payments", "investment_transactions", "goal_contributions"].includes(table)) {
        const parentField = table === "due_payments" ? "due_id" : table === "investment_transactions" ? "investment_id" : "goal_id";
        if (patch[parentField] !== undefined && patch[parentField] !== row[parentField]) return res.status(400).json({ error: "A payment cannot be moved to a different parent record." });
        const parentTable = table === "due_payments" ? "dues" : table === "investment_transactions" ? "investments" : "goals";
        const parent = await db.byId(parentTable, row[parentField]);
        if (!parent || parent.user_id !== req.user.sub) return res.status(400).json({ error: "The related record was not found in this profile." });
        const parentCurrency = parent.currency || "INR";
        if (patch.currency !== undefined) patch.currency = String(patch.currency || "").toUpperCase();
        const currencyValue = patch.currency || row.currency || parentCurrency;
        if (currencyValue !== parentCurrency) return res.status(400).json({ error: "Payment currency must match the related record." });
        if (patch.amount !== undefined && (!Number.isFinite(Number(patch.amount)) || !(Number(patch.amount) > 0))) return res.status(400).json({ error: "Enter a finite amount greater than zero." });
        if (patch.date !== undefined && !isValidIsoDate(String(patch.date))) return res.status(400).json({ error: "Enter a valid payment date." });
        if (table === "due_payments") {
          const dues = await db.list("due_payments", req.user.sub);
          const otherPaid = dues.filter((item) => item.due_id === parent.id && item.id !== row.id).reduce((sum, item) => sum + Number(item.amount), 0);
          const nextAmount = Number(patch.amount ?? row.amount);
          if (otherPaid + nextAmount > Number(parent.amount)) return res.status(400).json({ error: "Payment cannot exceed the remaining due amount." });
        }
        patch.currency = currencyValue;
      }
      res.json(await db.update(table, req.params.id, patch));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.delete(`/${entity}/:id`, requireAuth, async (req, res) => {
    try {
      const row = await db.byId(table, req.params.id);
      if (!row || row.user_id !== req.user.sub) return res.status(404).json({ error: "Not found" });
      if (table === "transactions") {
        await db.rpc("mutate_financial_transaction", { p_user_id: req.user.sub, p_transaction_id: req.params.id, p_action: "delete", p_row: null });
      } else await db.remove(table, req.params.id);
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}

router.post("/transactions/import", requireAuth, async (req, res) => {
  const rows = req.body?.transactions;
  if (!Array.isArray(rows) || rows.length > 500) return res.status(400).json({ error: "Provide up to 500 reviewed CSV transactions." });
  let imported = 0;
  let duplicates = 0;
  const errors = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!row || !/^[a-f0-9]{64}$/.test(String(row.fingerprint || "")) || !Number.isFinite(Number(row.amount)) || !(Number(row.amount) > 0)
      || !/^[A-Z]{3}$/.test(String(row.currency || "")) || !["income", "expense", "transfer"].includes(row.type)
      || typeof row.account_id !== "string" || !isValidIsoDate(String(row.date || ""))) {
      errors.push({ row: Number(row?.row_number) || index + 1, error: "Invalid amount, currency, type, account, date, or fingerprint." });
      continue;
    }
    try {
      const result = await db.rpc("commit_csv_transaction_v2", {
        p_user_id: req.user.sub, p_fingerprint: row.fingerprint, p_account_id: row.account_id,
        p_to_account_id: row.type === "transfer" ? row.to_account_id || null : null,
        p_amount: Number(row.amount), p_currency: row.currency,
        p_to_amount: row.type === "transfer" ? Number(row.to_amount || 0) : null,
        p_to_currency: row.type === "transfer" ? String(row.to_currency || "").toUpperCase() : null,
        p_exchange_rate: row.type === "transfer" ? Number(row.exchange_rate || 0) : null,
        p_type: row.type,
        p_category: String(row.category || "Other").slice(0, 100), p_description: String(row.description || "CSV transaction").slice(0, 200),
        p_note: String(row.note || "").slice(0, 1000), p_date: row.date,
      });
      if (result) imported += 1;
      else duplicates += 1;
    } catch (error) {
      errors.push({ row: Number(row.row_number) || index + 1, error: error.message });
    }
  }
  let historyWarning;
  try {
    await db.insert("import_batches", {
      user_id: req.user.sub, source: "csv", file_name: String(req.body.file_name || "").slice(0, 200) || null,
      rows_total: rows.length, imported_count: imported, duplicate_count: duplicates, failed_count: errors.length,
      errors: errors.slice(0, 100),
    });
  } catch (error) { historyWarning = "Transactions were processed, but this import could not be added to history."; }
  res.json({ imported, duplicates, errors, historyWarning });
});

router.post("/bills/:id/pay", requireAuth, async (req, res) => {
  try {
    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || !(amount > 0)) return res.status(400).json({ error: "Enter a finite payment amount greater than zero." });
    const result = await db.rpc("record_bill_payment", {
      p_user_id: req.user.sub,
      p_bill_id: req.params.id,
      p_due_date: String(req.body.due_date || "").slice(0, 10),
      p_amount: amount,
      p_paid_on: String(req.body.paid_on || new Date().toISOString()).slice(0, 10),
      p_create_expense: Boolean(req.body.create_expense),
      p_idempotency_key: String(req.body.idempotency_key || "").slice(0, 100) || null,
    });
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post("/bills/:id/skip", requireAuth, async (req, res) => {
  try {
    const dueDate = String(req.body?.due_date || "").slice(0, 10);
    if (!isValidIsoDate(dueDate)) return res.status(400).json({ error: "Choose the current bill due date." });
    const bill = await db.rpc("skip_bill_occurrence", { p_user_id: req.user.sub, p_bill_id: req.params.id, p_due_date: dueDate });
    res.json(bill);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post("/investments/:id/transactions", requireAuth, async (req, res) => {
  try {
    const type = String(req.body?.type || "");
    const amount = Number(req.body?.amount);
    const currency = String(req.body?.currency || "").toUpperCase();
    const date = String(req.body?.date || "");
    if (!["buy", "sell", "sip", "dividend"].includes(type) || !Number.isFinite(amount) || !(amount > 0)
      || !/^[A-Z]{3}$/.test(currency) || !isValidIsoDate(date)) {
      return res.status(400).json({ error: "Enter a valid type, finite amount, currency, and date." });
    }
    const result = await db.rpc("record_investment_transaction", {
      p_user_id: req.user.sub, p_investment_id: req.params.id, p_type: type,
      p_amount: amount, p_currency: currency, p_date: date, p_note: String(req.body?.note || "").slice(0, 500),
    });
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Goal contribution — stored in goal_contributions AND increments goals.current_amount
router.post("/goals/:id/contribute", requireAuth, async (req, res) => {
  try {
    const amount = Number(req.body.amount || 0);
    if (!Number.isFinite(amount) || !(amount > 0)) return res.status(400).json({ error: "Contribution must be a finite amount greater than zero." });
    const date = String(req.body?.date || new Date().toISOString().slice(0, 10));
    if (!isValidIsoDate(date)) return res.status(400).json({ error: "Enter a valid contribution date." });
    const result = await db.rpc("record_goal_contribution", {
      p_user_id: req.user.sub, p_goal_id: req.params.id, p_amount: amount,
      p_date: date, p_note: String(req.body?.note || "").slice(0, 500),
    });
    res.json(result.goal);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Profile update (currency, monthly income, name)
router.put("/profile", requireAuth, async (req, res) => {
  try {
    const patch = {};
    if (req.body.fullName !== undefined) {
      const fullName = String(req.body.fullName || "").trim().slice(0, 100);
      if (!fullName) return res.status(400).json({ error: "Enter a valid name." });
      patch.full_name = fullName;
    }
    if (req.body.currency !== undefined) {
      const currency = String(req.body.currency || "").toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) return res.status(400).json({ error: "Choose a valid three-letter currency code." });
      patch.currency = currency;
    }
    if (["dark", "light"].includes(req.body.theme)) patch.theme = req.body.theme;
    if (req.body.monthlyIncome !== undefined) {
      const monthlyIncome = Number(req.body.monthlyIncome);
      if (!Number.isFinite(monthlyIncome) || monthlyIncome < 0) return res.status(400).json({ error: "Enter a valid monthly income amount." });
      const profile = await db.findProfile(req.user.sub);
      const incomeCurrency = String(req.body.monthlyIncomeCurrency || profile?.monthly_income_currency || profile?.currency || "INR").toUpperCase();
      if (!/^[A-Z]{3}$/.test(incomeCurrency)) return res.status(400).json({ error: "Choose a valid monthly income currency." });
      patch.monthly_income = monthlyIncome;
      patch.monthly_income_currency = incomeCurrency;
    }
    res.json(await db.upsertProfile(req.user.sub, patch));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
