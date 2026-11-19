const db = require("../db");

async function purgeDueAccounts() {
  try {
    const deleted = await db.purgeDueAccounts();
    if (deleted) console.log(`[account-deletion] purged ${deleted} expired account(s)`);
  } catch (error) {
    console.error("[account-deletion] purge failed:", error.message);
  }
}

function startAccountDeletionPurger() {
  void purgeDueAccounts();
  const timer = setInterval(purgeDueAccounts, 60_000);
  timer.unref?.();
}

module.exports = { startAccountDeletionPurger };
