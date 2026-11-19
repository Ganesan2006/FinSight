const express = require("express");
const db = require("../db");
const { requireAuth } = require("../core/auth");
const { forwardSmsPreview, forwardSmsCommit } = require("../service/sms.service");

const router = express.Router();

router.post("/sms/preview", requireAuth, async (req, res) => {
  const messages = req.body?.messages;
  if (!Array.isArray(messages) || messages.length > 100) {
    return res.status(400).json({ error: "Provide up to 100 recent SMS messages." });
  }
  for (const message of messages) {
    if (!message || typeof message.id !== "string" || typeof message.body !== "string" || message.body.length < 1 || message.body.length > 5000 || !Number.isFinite(Number(message.timestamp)) || Number(message.timestamp) <= 0
      || (message.timezone_offset_minutes !== undefined && (!Number.isInteger(message.timezone_offset_minutes) || message.timezone_offset_minutes < -720 || message.timezone_offset_minutes > 840))) {
      return res.status(400).json({ error: "Each SMS must include an id, body, and positive timestamp." });
    }
  }
  const result = await forwardSmsPreview(messages, req.headers.authorization);
  res.status(result.status).json(result.body);
});

router.post("/sms/commit", requireAuth, async (req, res) => {
  const transactions = req.body?.transactions;
  if (!Array.isArray(transactions) || transactions.length > 100) return res.status(400).json({ error: "Select up to 100 reviewed transactions." });
  for (const item of transactions) {
    if (!item || !/^[a-f0-9]{64}$/i.test(String(item.fingerprint || "")) || !Number.isFinite(Number(item.amount)) || !(Number(item.amount) > 0)
      || !/^[A-Z]{3}$/.test(String(item.currency || "")) || !["income", "expense"].includes(item.type)
      || (item.account_id != null && (typeof item.account_id !== "string" || !item.account_id))
      || (!item.account_id && !/^\d{4}$/.test(String(item.account_mask || "")))
      || (item.account_mask != null && item.account_mask !== "" && !/^\d{4}$/.test(String(item.account_mask)))
      || (item.instrument_type != null && !["bank", "credit", "cash"].includes(item.instrument_type))
      || typeof item.description !== "string" || item.description.length < 1 || item.description.length > 100
      || typeof item.category !== "string" || item.category.length > 100
      || !/^\d{4}-\d{2}-\d{2}$/.test(String(item.date || ""))) {
      return res.status(400).json({ error: "Each selected message must contain valid reviewed transaction details." });
    }
  }
  const result = await forwardSmsCommit(transactions, req.headers.authorization);
  if (result.status < 400) {
    const body = result.body || {};
    try {
      await db.insert("import_batches", {
        user_id: req.user.sub, source: "sms", rows_total: transactions.length,
        imported_count: Number(body.imported || 0), duplicate_count: Number(body.duplicates || 0),
        failed_count: Array.isArray(body.errors) ? body.errors.length : 0,
        errors: Array.isArray(body.errors) ? body.errors.slice(0, 100) : [],
      });
    } catch {
      body.historyWarning = "Transactions were processed, but this import could not be added to history.";
    }
  }
  res.status(result.status).json(result.body);
});

module.exports = router;
