# Supabase setup

1. Create or select the Supabase project for the app.
2. Run `supabase/schema.sql` and all dated migrations in timestamp order,
   including `20261111_remove_bank_aggregation.sql`,
   `20261112_finance_workflows.sql`, `20261117_sms_account_matching.sql`, and
   `20261117_finance_product_quality.sql`, and
   `20261119_fix_account_reconciliations_created_at.sql`. They add multi-currency fields,
   budgets, bill history, account reconciliation, manual exchange rates, import
   history, auth recovery fields, and last-four account matching for reviewed
   SMS imports.
3. Add the project URL and a server-only secret key to `backend/.env`.
4. Set `EXPO_PUBLIC_API_URL` in `app/.env.local` to the Express API URL.

The app authenticates through the project's custom API routes and stores bcrypt
password hashes in the `users` table; it does not use Supabase Auth. The mobile
app does not connect to the database directly. The Express API and SMS parser
use the server-only secret key; never put that key in an `EXPO_PUBLIC_*`
variable or the mobile app.

New registrations require email verification, and password reset links expire
after one hour and revoke existing JWT sessions. Configure `AUTH_PUBLIC_URL`,
`RESEND_API_KEY`, and a verified `AUTH_EMAIL_FROM` sender in `backend/.env`.
Existing users are marked verified by the migration so they can keep signing
in. API rate limits are process-local; a multi-instance deployment needs a
shared rate-limit store or gateway rule.
