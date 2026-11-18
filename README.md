# ADEZ SMM

ADEZ SMM is a TanStack Start social-media growth panel using Manus OAuth for application login and Manus-managed MySQL for profiles, roles, services, orders, wallet transactions, payments, and audit records. The interface uses the blue-and-black ADEZ theme.

## Development

The Manus project injects `DATABASE_URL`, `MANUS_PROJECT_ID`, `MANUS_OAUTH_PORTAL_URL`, `MANUS_OAUTH_API_URL`, and `MANUS_JWT_SECRET` into the runtime. Provider credentials are protected project values and are never committed.

```sh
pnpm install
pnpm run db:migrate
pnpm run dev
```

`pnpm run db:migrate` is repeatable and applies the committed MySQL schema to the project-managed database. It should be run before the first preview or deployment after a schema change.

## Authentication

Users select **Continue with Manus**. The OAuth callback exchanges the authorization code server-side, creates or updates the local profile, and sets the Preview-compatible `webdev_app_session` cookie. The first registered identity becomes `super_admin`; the verified Manus identity whose email is `adez@tech.com` is also promoted to `super_admin` on first login. No app-specific password is stored.

## Verification

```sh
pnpm exec tsc --noEmit
pnpm run build
pnpm run test
```

## Android

The existing Capacitor wrapper remains available for APK packaging:

```sh
pnpm run mobile:apk
```

The Android debug APK is also built by the GitHub Actions workflow in `.github/workflows/android-apk.yml`.
