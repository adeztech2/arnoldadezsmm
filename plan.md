# ADEZ SMM Manus migration plan

## Implementation approach

Replace the existing Lovable Cloud/Supabase boundary with Manus OAuth for identity and application sessions, plus Drizzle ORM over the project-provided `DATABASE_URL` for MySQL persistence. Keep the existing storefront routes and business rules, but move user profiles, roles, settings, services, orders, wallet transactions, payments, and audit records into MySQL tables with application-level authorization.

Use the fixed `webdev_app_session` cookie for Preview compatibility. The OAuth callback will exchange the authorization code server-side, resolve the Manus identity, upsert the local user profile, and issue a signed application session. Server functions will load the authenticated user and role from the session and use parameterized MySQL queries. No password will be stored because Manus OAuth is the selected identity provider.

## Project structure

- `src/integrations/manus/`: OAuth client, session cookie handling, JWT verification/signing, and auth middleware.
- `src/db/`: Drizzle MySQL schema, connection, migrations, and role/profile helpers.
- `src/server/`: Existing order, wallet, payment, provider, audit, and admin operations adapted to the MySQL repository layer.
- `src/routes/`: Manus OAuth sign-in/callback/logout routes and existing storefront/authenticated routes.
- `scripts/`: Build helpers and a non-secret database migration command.
- `plan.md` and `TODO.md`: migration decisions and outcome tracking.

## Design decisions

Reuse the existing ADEZ SMM visual system. The blue-and-black palette remains the signature, with a light cool surface, black navigation surfaces, blue primary actions, and high-contrast text. Login becomes a single Manus OAuth action with clear identity/session status rather than an email/password form.

## Delivery

Enable server and managed MySQL in the Manus project configuration, apply additive migrations, run the existing application checks, save the working version to the Manus-managed repository, and mirror the completed source changes to the public GitHub repository when the migration is validated. Keep provider and database secrets in Manus configuration, never in source control.
