const jwt = require("jsonwebtoken");
const db = require("../db");
const { JWT_SECRET } = require("./config");

function sign(user) {
  return jwt.sign({ sub: user.id, email: user.email, name: user.full_name, ver: Number(user.auth_token_version || 0) }, JWT_SECRET, { expiresIn: "30d" });
}

function requireAuth(req, res, next) {
  const authorization = req.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing bearer token" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    db.byId("users", req.user.sub).then((user) => {
      if (!user) return res.status(401).json({ error: "Account no longer exists. Please register again." });
      const isCancelRequest = req.path.endsWith("/account-deletion/cancel");
      if (Number(req.user.ver || 0) !== Number(user.auth_token_version || 0)) return res.status(401).json({ error: "Your password changed. Please sign in again." });
      if (user.deletion_requested_at && !isCancelRequest) return res.status(423).json({ error: "This account is scheduled for deletion. Sign in again to cancel deletion during the seven-day recovery period." });
      next();
    }).catch(() => res.status(503).json({ error: "Could not verify account status. Please try again." }));
  } catch {
    res.status(401).json({ error: "Session expired. Please log in again." });
  }
}

function requireSupabaseSql(req, res, next) {
  if (!db.useSupabase) return res.status(503).json({ error: "Supabase database is not configured. SQL-backed sign-in is unavailable." });
  next();
}

module.exports = { sign, requireAuth, requireSupabaseSql };
