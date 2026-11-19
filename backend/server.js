require("./core/config");

const app = require("./core/app");
const { PORT, API_HOST } = require("./core/config");
const { startAccountDeletionPurger } = require("./service/account-deletion.service");

app.use("/api", require("./v1"));

app.listen(PORT, API_HOST, () => {
  console.log("\n  Finance Copilot REST API  →  http://" + API_HOST + ":" + PORT);
  console.log("  Storage: Supabase PostgreSQL");
  console.log("  Bank accounts: manual entry only\n");
  startAccountDeletionPurger();
});
