const { AUTH_PUBLIC_URL, RESEND_API_KEY, AUTH_EMAIL_FROM } = process.env;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

async function sendAuthEmail(to, subject, html) {
  if (!AUTH_PUBLIC_URL || !RESEND_API_KEY || !AUTH_EMAIL_FROM) {
    throw new Error("Email is not configured. Set AUTH_PUBLIC_URL, RESEND_API_KEY, and AUTH_EMAIL_FROM in backend/.env.");
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: AUTH_EMAIL_FROM, to: [to], subject, html }),
  });
  if (!response.ok) throw new Error("Email delivery failed. Please try again later.");
}

function hasEmailConfig() { return Boolean(AUTH_PUBLIC_URL && RESEND_API_KEY && AUTH_EMAIL_FROM); }

function publicApiUrl(path) {
  return `${String(AUTH_PUBLIC_URL || "").replace(/\/+$/, "")}${path}`;
}

function verifyEmailHtml(name, token) {
  const url = publicApiUrl(`/api/auth/verify-email?token=${encodeURIComponent(token)}`);
  return `<div style="font:16px system-ui;max-width:520px;margin:40px auto;color:#18202b"><h2>Verify your FinSight email</h2><p>Hello ${escapeHtml(name)}, confirm this email address to activate your account.</p><p><a href="${url}" style="display:inline-block;background:#087e72;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Verify email</a></p><p>This link expires in 24 hours. If you did not create this account, ignore this email.</p></div>`;
}

function passwordResetEmail(name, token) {
  const url = publicApiUrl(`/api/auth/reset-password?token=${encodeURIComponent(token)}`);
  return `<div style="font:16px system-ui;max-width:520px;margin:40px auto;color:#18202b"><h2>Reset your FinSight password</h2><p>Hello ${escapeHtml(name)}, use this link to choose a new password.</p><p><a href="${url}" style="display:inline-block;background:#087e72;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none">Reset password</a></p><p>This link expires in 60 minutes. If you did not ask to reset your password, ignore this email.</p></div>`;
}

module.exports = { sendAuthEmail, verifyEmailHtml, passwordResetEmail, publicApiUrl, hasEmailConfig };
