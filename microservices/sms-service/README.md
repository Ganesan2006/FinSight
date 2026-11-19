# SMS parser service

This FastAPI service classifies and extracts transactions from SMS messages
received through the authenticated Express API. For environment setup,
permissions, and the complete request flow, see the
[SMS import guide](../../docs/sms-import.md).

Run it from this directory with `uvicorn app.main:app --host 0.0.0.0 --port
8000` after installing `requirements.txt` and configuring `app/.env` from
`env.example`.

If an existing launcher uses `uvicorn server:app`, `server.py` is provided as a
compatibility entry point. In either case, start Uvicorn from this directory so
the `app` package can be imported.
