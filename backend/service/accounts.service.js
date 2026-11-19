const db = require("../db");

async function ownedAccount(accountId, userId) {
  if (!accountId) return null;
  const row = await db.byId("accounts", accountId);
  return row && row.user_id === userId ? row : null;
}
module.exports = { ownedAccount };
