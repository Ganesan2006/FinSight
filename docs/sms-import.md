# Android SMS import

SMS import is available in the mobile app under **Settings → Data & privacy →
Review recent SMS**. The app requests Android's `READ_SMS` permission when the
user starts an import and reads up to 100 inbox messages.

## Service flow

1. The user explicitly starts an import. Android requests `READ_SMS` permission
   then reads up to 100 inbox messages on demand; there is no background reader.
2. The app sends those messages to `POST /api/sms/preview`. The API forwards
   them to the FastAPI parser. Regex rules discard messages without a completed
   transaction signal and a monetary amount before any LLM request. The parser
   returns candidates without saving them.
3. The user reviews and edits candidates, including transaction direction,
   issuer, and last-four digits when extraction needs correction. FinSight matches the issuer, currency,
   account type, and last four digits against the user's own saved accounts. A
   unique match is selected automatically; if none exists and a four-digit
   suffix is available, the review offers a masked account and asks for
   confirmation before creating it during the selected transaction commit. Ambiguous matches require a
   manual account choice. If the SMS has no suffix, choose an existing account.

Raw SMS bodies are processed for extraction and are not written to the ledger.
The database stores only the last four account digits and a one-way message
fingerprint; it does not store a full account number or raw SMS body. The SMS
transaction and any new masked account are committed together. iOS does not
expose SMS inbox access; use manual entry or CSV import there.

## Configure and run

Set `SMS_SERVICE_URL` in `backend/.env` if the parser is not reachable at
`http://127.0.0.1:8000`. Set the Groq key in
`microservices/sms-service/app/.env`; keep it server-side.

```sh
cd microservices/sms-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp env.example app/.env
# Add GROQ_API_KEY to app/.env before starting the service.
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

The SMS service reads `JWT_SECRET`, `SUPABASE_URL`, and
`SUPABASE_SECRET_KEY` from `backend/.env` when they are not set in
`microservices/sms-service/app/.env`. The two services must use the same JWT secret.
