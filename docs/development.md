# Local development

## Install dependencies

Each service maintains its own dependencies:

```sh
# App dependencies
cd app && npm install

# Backend dependencies
cd ../backend && npm install

# SMS service dependencies
cd ../microservices/sms-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Configure and run the mobile app

Copy `app/.env.local.example` to `app/.env.local`, then set:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_API_URL`

For an Android emulator, use `http://10.0.2.2:4000` as the API URL. For a
physical device, use the development computer's LAN IP address.

Start the mobile app from the `app` directory:

```sh
cd app
npm start
npm run android
npm run ios
npm run web
```

## Configure and start the API

Copy `backend/.env.example` to `backend/.env`. Set `SUPABASE_URL`,
`SUPABASE_SECRET_KEY`, and a private `JWT_SECRET` of at least 32 characters.
Then, from the `backend` directory, run:

```sh
cd backend
npm run dev
```

Use `npm start` to start without watch mode. The API listens on port
4000 by default.

## Start the SMS parser

Follow the Python environment and startup steps in the
[SMS import guide](sms-import.md). Start the parser before importing messages
from the app.
