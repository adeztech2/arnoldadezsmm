# Deploying ADEZ SMM with Manus

This application is designed for a Manus Web project with the server and managed MySQL capabilities enabled. The platform supplies the database connection and Manus OAuth runtime values; application tables are created by the committed migration script.

## 1. Install, migrate, and build

```sh
pnpm install
pnpm run db:migrate
pnpm exec tsc --noEmit
pnpm run build
```

The application server must listen on the project runtime port. Keep browser-facing URLs relative and let the Manus proxy provide the public HTTPS origin.

## Vercel

For the Vercel project, use the TanStack Start framework preset; the repository includes `vercel.json`. Add these values in **Settings → Environment Variables** for the environments you deploy:

```text
DATABASE_URL
MANUS_PROJECT_ID
MANUS_OAUTH_PORTAL_URL
MANUS_OAUTH_API_URL
MANUS_JWT_SECRET
```

Without these values, public pages can render but `/manus-oauth/start` cannot begin sign-in and protected server functions cannot access MySQL. Redeploy after adding or changing Vercel environment variables.

## 2. Runtime values

The Manus project supplies these values automatically:

```text
DATABASE_URL
MANUS_PROJECT_ID
MANUS_OAUTH_PORTAL_URL
MANUS_OAUTH_API_URL
MANUS_JWT_SECRET
```

The requested verified identity `adez@tech.com` is treated as the bootstrap super-admin when it signs in through Manus OAuth. The app does not store or validate a password.

Provider credentials must be added as protected Manus project values before enabling live ordering and payments:

```text
SHAKERGAINS_API_KEY
GIFTEDPAY_API_KEY
PAYSTACK_SECRET_KEY
```

## 3. Webhooks and Android

Set the Paystack webhook to `https://YOUR-DOMAIN/api/public/webhooks/paystack`. The Capacitor wrapper uses the same web build and can be packaged with `pnpm run mobile:apk`; the GitHub Actions workflow produces a downloadable debug APK artifact.
