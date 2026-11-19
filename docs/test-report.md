# Version1 verification

## Automated results

* 36 tests passed.
* 0 failed, skipped or canceled tests.
* Server and frontend JavaScript syntax checks passed.
* Required distribution files present.
* Test database: isolated MongoDB 8.0.5 replica set.
* Provider endpoints: controlled mocked HTTP responses, not live merchant accounts.

Coverage includes:

1. Password hashing, length rules, authenticated encryption and tamper detection.
2. CSRF, same-origin checks, admin authorization, protected super-admin role and customer ownership.
3. First-registration role assignment and concurrent registrations.
4. Encrypted settings, key-status flags and no secret leakage into responses or audits.
5. Catalog import, category variants, current rates, unsupported-type labeling and retained selling prices.
6. Integer wallet pricing, quantity-derived custom comments, poll validation, phone validation and exchange conversion.
7. M-Pesa wallet credit, concurrent verification and duplicate-credit prevention.
8. Card-only Paystack hosted checkout, signed webhooks and repeated-callback safety.
9. Verified-payment amount mismatch held for review without credit.
10. Order idempotency, changed-payload rejection and concurrent wallet overspend protection.
11. Confirmed provider rejection refunds and uncertain submission holds.
12. Partial-order refund calculation, retained provider cost and retry safety.
13. Bulk-order independent failures and safe replay.
14. Customer wallet history, dashboard metrics and persistent profitability reports.
15. Account-country locking after financial activity.
16. Audited, idempotent administrator balance adjustments and capped cumulative refunds.
17. Resend reset request, token hashing, one-time token use and session invalidation.
18. Authenticated scheduler, rejected NoSQL-shaped inputs and server-file protection.

## Running application

The Node preview starts successfully and serves HTML, CSS and browser modules. Public settings reports `configured: false` while no live MongoDB URI is configured. Health reports the server as running and database as not connected.

Desktop and mobile public screens were visually inspected. Signed-in page rendering was not browser-verified; authenticated endpoint behavior was covered by integration tests.

## Not live-verified

* The owner's MongoDB Atlas database and its host/network configuration.
* Real ShakerGains catalog, provider account balance, fulfilment, cancellation or refill.
* Real GiftedPay M-Pesa prompts and settlement.
* Real Paystack merchant currency support, card charges and webhook delivery.
* Real Resend domain verification and inbox delivery.
* Actual Vercel or Render deployment.

These require owner credentials and account setup. No live customers, funds or upstream orders were used for testing.
