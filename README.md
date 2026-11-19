# FinSight

FinSight is organized into modular services with separate dependencies:

```text
app/            Expo and React Native mobile app
backend/        Express API
microservices/
  sms-service/  FastAPI SMS parser
supabase/       Database schema and migrations
```

Project guides live in [`docs/README.md`](docs/README.md).

## Install and run

Each service maintains its own dependencies:

### 1. App (`app/`)
```sh
cd app
npm install
npm start          # Metro bundler
npm run android    # Android
npm run ios        # iOS
npm run web        # Web browser
```

Configure `app/.env.local` (copy from `app/.env.local.example`), then set
`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, and
`EXPO_PUBLIC_API_URL`. Use the computer's LAN IP for a physical Android device
or `http://10.0.2.2:4000` for the Android emulator.

### 2. Backend (`backend/`)
```sh
cd backend
npm install
npm run dev        # Watch mode
# or npm start
```

Configure `backend/.env` (copy from `backend/.env.example`). Set `SUPABASE_URL`,
`SUPABASE_SECRET_KEY`, and `JWT_SECRET`.

### 3. SMS Microservice (`microservices/sms-service/`)
```sh
cd microservices/sms-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp env.example app/.env
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

---

## Supabase setup

Run `supabase/schema.sql` and all dated migrations in timestamp order in the
Supabase SQL Editor, including `20261111_remove_bank_aggregation.sql`,
`20261112_finance_workflows.sql`, `20261117_sms_account_matching.sql`, and
`20261117_finance_product_quality.sql`, and
`20261119_fix_account_reconciliations_created_at.sql`. These add currency-aware records,
budgets, bill occurrences, account reconciliation history, manual exchange
rates, reviewed import history, account recovery fields, and seven-day account
deletion scheduling.

The app uses custom API sign-up and sign-in routes backed by Supabase Postgres.
New accounts verify their email and password recovery uses expiring email links
through Resend. Set `AUTH_PUBLIC_URL` to the public API origin, `RESEND_API_KEY`,
and a verified `AUTH_EMAIL_FROM` sender in `backend/.env`. Existing users are
preserved as verified when the migration is applied. Auth throttling is in-memory
per API process, so deployments with multiple API replicas should put a shared
rate-limit store in front of the service. The server uses a private Supabase key
and scopes finance queries to the authenticated user; the mobile app never
receives that key.

Exchange rates are entered by the user and only apply from their effective date;
FinSight does not fetch live rates. Without a saved rate, balances and spending
remain grouped by currency rather than being added together.

## Android SMS transaction import

SMS import is available from **Settings → Data & privacy → Review recent SMS**
on Android. The app requests `READ_SMS` at that point, reads up to 100 inbox
messages, and posts them to the authenticated Node API. The API forwards them
to the Python parser service.

Set `GROQ_API_KEY` in `microservices/sms-service/app/.env`. Configure `SUPABASE_URL`
and the server-only `SUPABASE_SECRET_KEY` in `backend/.env` (copy
`backend/.env.example` first). Use a Supabase secret key (`sb_secret_...`) or
the legacy `service_role` key, never a publishable key. The SMS service reads
these database credentials from `backend/.env` when they are not set in
`microservices/sms-service/app/.env`. Set `SMS_SERVICE_URL` in `backend/.env` if the
Python service is not available at `http://127.0.0.1:8000` from the Node API.

The service verifies the signed-in app JWT and returns parsed candidates for
review. The user can edit candidates and choose an account before committing;
only committed ledger fields and a one-way SMS deduplication fingerprint are
stored. The raw SMS body is not written to Supabase. Keep LLM and Supabase
service keys on the server.

Bank accounts are managed with manual entry. This project does not include
account aggregation or automatic bank background sync. SMS import is optional,
explicitly user-triggered, and Android-only. Android and iOS both support manual
entry and transaction CSV import/export.
