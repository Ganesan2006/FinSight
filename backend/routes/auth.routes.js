const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const db = require("../db");
const { sign, requireAuth, requireSupabaseSql } = require("../core/auth");
const { rateLimit } = require("../service/rate-limit.service");
const { sendAuthEmail, verifyEmailHtml, passwordResetEmail, publicApiUrl, hasEmailConfig } = require("../service/auth-email.service");

const router = express.Router();
const token = () => crypto.randomBytes(32).toString("base64url");
const isRawToken = (value) => /^[A-Za-z0-9_-]{43}$/.test(String(value || ""));
const tokenHash = (value) => crypto.createHash("sha256").update(String(value)).digest("hex");
const emailKey = (req) => {
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  const emailHash = tokenHash(String(req.body?.email || "").trim().toLowerCase()).slice(0, 16);
  return `${ip}:${emailHash}`;
};
const registrationLimit = rateLimit({ max: 5 });
const loginIpLimit = rateLimit({ max: 30 });
const loginLimit = rateLimit({ max: 10, key: emailKey });
const recoveryIpLimit = rateLimit({ max: 10 });
const resetLimit = rateLimit({ max: 4, key: emailKey });

// ============================================================
// AUTH — minimal custom SQL flow (users table + bcrypt + JWT)
// ============================================================

router.post("/auth/register", registrationLimit, requireSupabaseSql, async (req, res) => {
  try {
    const { fullName, email, password } = req.body || {};
    const currency = String(req.body.currency || "INR").toUpperCase();
    const phone = String(req.body.phone || "").replace(/[\s().-]/g, "");
    const normalizedEmail = String(email || "").trim().toLowerCase();
    if (typeof fullName !== "string" || !fullName.trim()) return res.status(400).json({ error: "Please enter your name." });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return res.status(400).json({ error: "Please enter a valid email address." });
    if (!/^[A-Z]{3}$/.test(currency)) return res.status(400).json({ error: "Choose a valid three-letter currency code." });
    if (!/^\+?[1-9]\d{6,14}$/.test(phone)) return res.status(400).json({ error: "Enter a valid phone number, including country code if needed." });
    if (typeof password !== "string" || password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });

    if (!hasEmailConfig()) return res.status(503).json({ error: "Email verification is not configured. Set AUTH_PUBLIC_URL, RESEND_API_KEY, and AUTH_EMAIL_FROM on the backend." });
    if (await db.findUserByEmail(normalizedEmail)) return res.status(409).json({ error: "This email is already registered. Please log in instead." });

    const passwordSalt = await bcrypt.genSalt(12);
    const hash = await bcrypt.hash(password, passwordSalt);
    const verificationToken = token();
    const user = await db.createUser({
      full_name: fullName.trim(),
      email: normalizedEmail,
      password_hash: hash,
      password_salt: passwordSalt,
      email_verification_token_hash: tokenHash(verificationToken),
      email_verification_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      auth_token_version: 0,
    });
    try {
      await db.upsertProfile(user.id, { full_name: user.full_name, email: user.email, phone_number: phone, currency, monthly_income: 0, monthly_income_currency: currency });
      await db.saveSubscription(user.id, { plan: "free", status: "active", billing_cycle: "monthly", current_period_end: null });
      await sendAuthEmail(normalizedEmail, "Verify your FinSight email", verifyEmailHtml(user.full_name, verificationToken));
    } catch (error) {
      await db.remove("users", user.id).catch(() => {});
      throw error;
    }
    res.status(201).json({ verificationRequired: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/auth/login", loginIpLimit, loginLimit, requireSupabaseSql, async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = req.body?.password;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== "string" || !password) {
      return res.status(400).json({ error: "Enter your email and password." });
    }
    const user = await db.findUserByEmail(email);
    if (!user || !await bcrypt.compare(password, user.password_hash || "")) {
      return res.status(401).json({ error: "Email or password is incorrect." });
    }
    if (!user.email_verified_at) return res.status(403).json({ code: "EMAIL_NOT_VERIFIED", error: "Verify your email before signing in. Check your inbox or request a new verification link." });
    if (user.deletion_scheduled_at && new Date(user.deletion_scheduled_at).getTime() <= Date.now()) {
      return res.status(410).json({ error: "The account deletion period has ended. This account's data is being permanently removed." });
    }
    if (user.deletion_requested_at) await db.update("users", user.id, { deletion_requested_at: null, deletion_scheduled_at: null });
    const profile = await db.findProfile(user.id);
    res.json({ token: sign(user), user: { id: user.id, fullName: profile?.full_name || user.full_name, email: user.email, phone: profile?.phone_number || "" } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/auth/verification/resend", recoveryIpLimit, resetLimit, requireSupabaseSql, async (req, res) => {
  try {
    if (!hasEmailConfig()) return res.status(503).json({ error: "Email delivery is not configured on the backend." });
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
    const user = await db.findUserByEmail(email);
    if (user && !user.email_verified_at) {
      const verificationToken = token();
      await db.update("users", user.id, {
        email_verification_token_hash: tokenHash(verificationToken),
        email_verification_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      });
      await sendAuthEmail(email, "Verify your FinSight email", verifyEmailHtml(user.full_name, verificationToken));
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/auth/verify-email", rateLimit({ max: 10 }), requireSupabaseSql, async (req, res) => {
  try {
    const rawToken = String(req.query.token || "");
    const user = isRawToken(rawToken) ? await db.findUserByToken("email_verification_token_hash", tokenHash(rawToken)) : null;
    if (!user || !user.email_verification_expires_at || new Date(user.email_verification_expires_at).getTime() <= Date.now()) {
      return res.status(400).type("html").send("<main><h2>This verification link is invalid or expired.</h2><p>Return to FinSight and request another link.</p></main>");
    }
    await db.update("users", user.id, {
      email_verified_at: new Date().toISOString(), email_verification_token_hash: null, email_verification_expires_at: null,
    });
    res.type("html").send("<main style='font:16px system-ui;max-width:520px;margin:40px auto'><h2>Email verified</h2><p>Your FinSight account is ready. Return to the app and sign in.</p></main>");
  } catch { res.status(500).type("html").send("<main><h2>Could not verify email.</h2><p>Please try again from the FinSight app.</p></main>"); }
});

router.post("/auth/password-reset/request", recoveryIpLimit, resetLimit, requireSupabaseSql, async (req, res) => {
  try {
    if (!hasEmailConfig()) return res.status(503).json({ error: "Password recovery email is not configured on the backend." });
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
    const user = await db.findUserByEmail(email);
    if (user && user.email_verified_at) {
      const resetToken = token();
      await db.update("users", user.id, {
        password_reset_token_hash: tokenHash(resetToken),
        password_reset_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });
      await sendAuthEmail(email, "Reset your FinSight password", passwordResetEmail(user.full_name, resetToken));
    }
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/auth/reset-password", rateLimit({ max: 10 }), requireSupabaseSql, async (req, res) => {
  try {
    const rawToken = String(req.query.token || "");
    const user = isRawToken(rawToken) ? await db.findUserByToken("password_reset_token_hash", tokenHash(rawToken)) : null;
    if (!user || !user.password_reset_expires_at || new Date(user.password_reset_expires_at).getTime() <= Date.now()) {
      return res.status(400).type("html").send("<main><h2>This reset link is invalid or expired.</h2><p>Return to FinSight and request another link.</p></main>");
    }
    res.type("html").send(`<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><main style="font:16px system-ui;max-width:420px;margin:40px auto;padding:16px"><h2>Choose a new password</h2><form id="reset"><label>New password<input id="password" type="password" minlength="8" autocomplete="new-password" required style="display:block;width:100%;padding:12px;margin:8px 0 16px"></label><button style="padding:12px 18px">Save password</button></form><p id="message" role="status"></p><script>document.getElementById('reset').addEventListener('submit',async function(event){event.preventDefault();const message=document.getElementById('message');const password=document.getElementById('password').value;message.textContent='Saving…';try{const response=await fetch('${publicApiUrl("/api/auth/password-reset/confirm")}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'${rawToken}',password})});const result=await response.json();message.textContent=response.ok?'Password updated. Return to FinSight and sign in.':(result.error||'Could not update password.');}catch(_){message.textContent='Could not reach the server. Please try again.';}});</script></main>`);
  } catch { res.status(500).type("html").send("<main><h2>Could not open password recovery.</h2><p>Please request a new link.</p></main>"); }
});

router.post("/auth/password-reset/confirm", recoveryIpLimit, resetLimit, requireSupabaseSql, async (req, res) => {
  try {
    const rawToken = String(req.body?.token || "");
    const password = req.body?.password;
    if (typeof password !== "string" || password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
    if (!isRawToken(rawToken)) return res.status(400).json({ error: "This reset link is invalid or expired. Request another link." });
    const passwordSalt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, passwordSalt);
    const completed = await db.rpc("complete_password_reset", {
      p_token_hash: tokenHash(rawToken), p_password_hash: passwordHash, p_password_salt: passwordSalt,
    });
    if (!completed) return res.status(400).json({ error: "This reset link is invalid or expired. Request another link." });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get("/auth/me", requireSupabaseSql, requireAuth, async (req, res) => {
  const user = await db.byId("users", req.user.sub);
  if (!user) return res.status(404).json({ error: "User not found" });
  const profile = await db.findProfile(user.id);
  res.json({ id: user.id, fullName: profile?.full_name || user.full_name, email: user.email, phone: profile?.phone_number || "" });
});

router.delete("/account", requireSupabaseSql, requireAuth, async (req, res) => {
  try {
    const now = new Date();
    const scheduled = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    await db.update("users", req.user.sub, { deletion_requested_at: now.toISOString(), deletion_scheduled_at: scheduled.toISOString() });
    res.json({ ok: true, deletionScheduledAt: scheduled.toISOString(), recoveryDays: 7 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post("/account-deletion/cancel", requireSupabaseSql, requireAuth, async (req, res) => {
  try {
    const user = await db.byId("users", req.user.sub);
    if (!user || !user.deletion_scheduled_at || new Date(user.deletion_scheduled_at).getTime() <= Date.now()) {
      return res.status(410).json({ error: "The account recovery period has ended." });
    }
    await db.update("users", req.user.sub, { deletion_requested_at: null, deletion_scheduled_at: null });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
