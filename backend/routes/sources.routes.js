const express = require("express");
const db = require("../db");
const { requireAuth } = require("../core/auth");
const { SOURCE_CATALOGUE, PLANS } = require("../service/catalogs");

const router = express.Router();

router.get("/subscription/plans", (_req, res) => res.json(PLANS));
router.get("/subscription", requireAuth, async (req, res) => {
  try {
    const subscription = await db.getSubscription(req.user.sub);
    res.json({ ...subscription, plan_details: PLANS.find((plan) => plan.id === subscription.plan) || PLANS[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.put("/subscription", requireAuth, async (req, res) => {
  try {
    const plan = PLANS.find((p) => p.id === req.body.plan);
    if (!plan) return res.status(400).json({ error: "Choose a valid plan." });
    if (plan.id !== "free") return res.status(409).json({ code: "CHECKOUT_UNAVAILABLE", error: "Paid checkout is not configured yet. Your current plan has not changed." });
    const subscription = await db.saveSubscription(req.user.sub, {
      plan: "free", status: "active", billing_cycle: "monthly", current_period_end: null,
    });
    res.json({ ...subscription, plan_details: plan });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/sources/catalogue", (_req, res) => res.json(SOURCE_CATALOGUE));

router.post("/sources/connect", requireAuth, async (req, res) => {
  try {
    const { kind, provider, label, apiKey } = req.body || {};
    if (kind !== "broker" && kind !== "card") return res.status(400).json({ error: "Choose a supported non-bank source." });
    const list = SOURCE_CATALOGUE[kind === "broker" ? "brokers" : "cards"] || [];
    const entry = list.find((x) => x.provider === provider);
    if (!entry) return res.status(400).json({ error: "Unknown provider" });
    if (!entry.active) return res.status(409).json({ error: "Temporarily not available", available: false });

    const row = await db.insert("connected_sources", {
      user_id: req.user.sub, kind, provider,
      label: label || entry.label,
      status: entry.active ? "connected" : "coming-soon",
      meta: { note: entry.active ? "Connected from account settings" : "Option shown for roadmap — integration pending credentials", hasKey: Boolean(apiKey) },
    });

    let importResult = null;
    if (kind === "broker" && entry.active) {
      // Groww: live fetch hook when GROWW_API_KEY is configured server-side.
      // Without it we still store the connection row (no dummy data).
      if (process.env.GROWW_API_KEY) {
        try {
          const g = await fetch(`https://api.groww.in/v1/holdings?api_key=${process.env.GROWW_API_KEY}`);
          if (g.ok) {
            const json = await g.json();
            for (const h of json.holdings || []) {
              const extId = "groww-" + (h.isin || h.name);
              const existing = await db.list("investments", req.user.sub);
              const match = existing.find((x) => x.external_id === extId);
              const payload = { asset_name: h.name, type: "Stocks", invested_amount: Number(h.avgCost || 0) * Number(h.qty || 0), current_value: Number(h.ltp || 0) * Number(h.qty || 0), external_id: extId };
              if (match) await db.update("investments", match.id, payload);
              else await db.insert("investments", { user_id: req.user.sub, ...payload });
            }
            importResult = { source: "groww-live", imported: (json.holdings || []).length };
          }
        } catch (e) { console.warn("[groww]", e.message); }
      }
      if (!importResult) importResult = { source: "groww-key-pending", imported: 0, note: "Connection saved. Set GROWW_API_KEY in backend/.env to pull live holdings." };
    } else {
      importResult = { source: "option-only", imported: 0, note: `${entry.label} is listed as an option; integration unlocks with credentials.` };
    }
    res.json({ ok: true, row, importResult });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete("/sources/:id", requireAuth, async (req, res) => {
  try {
    const row = await db.byId("connected_sources", req.params.id);
    if (!row || row.user_id !== req.user.sub) return res.status(404).json({ error: "Not found" });
    await db.remove("connected_sources", req.params.id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
