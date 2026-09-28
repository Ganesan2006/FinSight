# Finance Copilot

A personal finance tracker built with Expo and React Native. It includes Spend, Due, Invest, Goal, and Bill tabs, with More in the top-right menu.

## Run the app

```sh
npm install
npx expo start
```

Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`. The app uses Supabase email/password authentication. Account creation asks for name, email, phone number, password, and password confirmation; after signup it returns to the login screen. Profile and finance records are stored in Supabase and isolated by row-level security. The anon key is a public client key; database access is protected by RLS and must never be replaced with a service-role key in the app.

## Supabase setup

Enable the Email provider in Supabase Authentication settings, then run [supabase/schema.sql](supabase/schema.sql) once in the Supabase SQL Editor. Choose whether email confirmation is required; the app supports both confirmed and immediate signup. The schema creates the finance tables, row-level security policies, and database-side transaction and bill-payment functions.

Supabase project keys are required for account creation and login.
# FinSight
