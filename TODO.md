# Migration outcomes

## Manus authentication replaces Supabase login

- [x] Sign-in uses Manus OAuth rather than Supabase email/password or Lovable OAuth.
- [x] The OAuth callback exchanges the authorization code server-side and redirects only to the fixed in-app callback path.
- [x] The application session uses the exact `webdev_app_session` cookie name and validates the session before protected requests.
- [x] Logout clears the application session and returns the user to the sign-in page.

## Manus-managed MySQL stores application data

- [x] The application reads the platform-provided `DATABASE_URL` and uses parameterized MySQL queries.
- [x] Tables preserve profiles, roles, settings, services, orders, transactions, payments, and audit logs.
- [x] Migration execution is repeatable and does not store credentials in the repository.

## Role-based access and admin behavior

- [x] New Manus identities receive a local profile and user role.
- [x] The first registered application identity receives `super_admin`.
- [x] Admin-only server actions enforce `admin` or `super_admin` authorization.
- [x] The authenticated dashboard shows the signed-in Manus identity and exposes only authorized operations.

## Existing business behavior remains available

- [ ] Service catalog and storefront data access continue to work.
- [ ] Order placement, idempotency, wallet changes, refunds, and provider status refresh use the MySQL repository.
- [ ] Payment initialization and verification continue to use the configured provider secrets.
- [ ] Audit logging remains active for staff and system actions.

## Verification and delivery

- [x] Typecheck/build pass in the Manus project environment.
- [ ] The migrated source is saved to the Manus-managed repository.
- [ ] The public GitHub repository receives the validated migration changes without secrets.
