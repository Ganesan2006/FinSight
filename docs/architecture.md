# Architecture

FinSight is organized into modular services with separate dependencies and shared database assets:

| Path | Responsibility |
| --- | --- |
| `app` | Expo and React Native client |
| `backend` | Express API, authentication, and Supabase access |
| `microservices/sms-service` | FastAPI SMS parsing and transaction extraction |
| `supabase` | SQL schema and migrations |

The API separates responsibilities within `backend`:

| Path | Responsibility |
| --- | --- |
| `server.js` | Process entry point and HTTP listener |
| `core` | Environment configuration, Express setup, and JWT middleware |
| `v1` | Assembles the current API route set |
| `routes` | Express handlers grouped by feature |
| `service` | Account, SMS, optional broker/card connections, and shared catalogues |
| `db` | Supabase data access |

The `v1` directory is an internal code grouping. Existing client URLs remain
under `/api/...`; this refactor does not change the public route prefix.

Each service maintains its own dependencies independently:
- `app/package.json` manages client React Native/Expo dependencies.
- `backend/package.json` manages Express and database dependencies.
- `microservices/sms-service/requirements.txt` manages Python FastAPI/LangGraph dependencies.

## Request flow

The mobile client reads `EXPO_PUBLIC_API_URL` and sends authenticated requests
to the Express API. The API validates app JWTs and scopes finance operations to
the signed-in user. It uses the Supabase server key from `backend/.env`; that
key must stay out of the mobile bundle.

SMS import follows the same authenticated path on Android only. The API
forwards authorized messages to the FastAPI service, which returns candidates
for review. A separate reviewed commit writes the transaction and any new
masked account through a user-scoped Supabase function. There is no bank
aggregation or background account sync; users enter and manage bank accounts
manually. See the [SMS import guide](sms-import.md).
