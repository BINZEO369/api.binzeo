# Central payments

## Customer flow and ownership

The customer selects Cash on Delivery or Stripe during JABIYEN checkout. For Stripe, JABIYEN submits the order through its server API and redirects the customer to the central BINZEO Auth payment page. JABIYEN never creates a Stripe Checkout Session or trusts browser-supplied prices. The central server reads the saved order and account identity, checks that the order belongs to the signed-in customer, and creates a hosted Stripe Checkout Session. Card entry remains on Stripe's domain.

The signed Stripe webhook is the source of payment truth. After it verifies the Checkout Session against the immutable central request (request ID, account, site, amount, currency and Stripe metadata), the central server calls a service-role-only, idempotent JABIYEN database function. That transaction changes the JABIYEN order/payment records to confirmed/collected. This fulfillment continues even if the customer's browser closes. Confirmation emails are sent only after this server-side order update succeeds.

After Central Auth sees both `payment_requests.status = 'paid'` and `fulfillment_status = 'fulfilled'`, it can issue a short-lived one-time return link. The raw random token is returned only to the authenticated customer, stored in the central database as a SHA-256 hash, and placed in the URL fragment (not sent in HTTP requests or Referer headers). JABIYEN immediately removes the fragment from browser history and redeems the token through a same-origin API request. Central redemption atomically consumes the token and returns only the confirmed order whose email, order number, Stripe status and exact USD total still match. Expired or replayed tokens are rejected; customers can request a fresh token from Auth.

All new central payment requests and Stripe charges use USD. JABIYEN product, shipping and saved order totals are treated as USD amounts without exchange-rate conversion. The central payment record is denominated in USD cents. The JABIYEN Stripe fulfillment RPC also compares the saved USD total against the immutable central amount before it confirms the order. Historical legacy currency labels remain tolerated only to preserve existing rows; new orders and Stripe-settled rows are stored as USD.

All central payment configuration, requests, attempts, Stripe Customer mappings, webhook inbox records, fulfillment state and handoff hashes are stored in the central Auth Supabase database. JABIYEN's database remains the order source of truth and is updated only by the central service-role RPC after verified Stripe success. No card data is stored.

The central provider is configured for the user-selected United States / USD setup and shared `test` mode; all sites use the same mode. Real charges remain blocked by `STRIPE_LIVE_CHARGES_ENABLED=false`. Before live use, switch the central provider mode to `live`, configure the matching live Stripe key and webhook signing secret, and intentionally enable the gate.

## Server-side trust and amount rules

The central payment page derives the customer ID, verified email and profile name from Central Auth. Browser requests cannot set the amount, currency, owner, Stripe identifiers or return URL. For JABIYEN, the central adapter loads the saved order, matches its email to the verified Central Auth email, rejects cancelled/returned or already-collected orders, requires confirmed shipping, and validates stored item prices, line totals, subtotal, delivery fee and total using exact decimal-to-cent arithmetic. It then saves an immutable USD amount and line-item snapshot in the central database. There is no exchange-rate lookup or conversion.

A browser redirect, query string or client-side success state never marks a payment paid. Only a signed Stripe webhook can do so. Before JABIYEN is fulfilled, the server additionally verifies the exact central amount against the still-saved JABIYEN order total. A mismatched amount or payment proof fails closed and is recorded as a failed webhook event for investigation; no manual database toggle may be used to mark it paid.

## API contract

- `POST /v1/payments/jabiyen/checkout-sessions` — Authenticated order-number-only checkout request; central server verifies the order and computes the USD amount.
- `POST /v1/payments/checkout-sessions` — Trusted integrations using an existing immutable central payment request; accepts only its request ID and idempotency key.
- `GET /v1/payments/requests/{requestId}` — Authenticated, owner-scoped payment and fulfillment status.
- `POST /v1/payments/requests/{requestId}/return-handoff` — Authenticated owner-only token issuance, available only after payment and JABIYEN fulfillment are verified.
- `POST /v1/projects/jabiyen/public/payment-handoff` — Same-origin public redemption endpoint; rate-limited, token-hash lookup and atomic single-use consumption.
- `POST /v1/payments/stripe/webhook` — Stripe-signature authenticated endpoint that verifies the original raw body.
- `GET /api/admin/payments` — Admin-only, paginated multi-site payment history; requires `super_admin` or `payments.read`.

Checkout success/cancel destinations and the JABIYEN order-return destination are configured in central `payment_site_settings` and constrained by each project's registered origin allowlist. The Auth frontend does not embed a fixed JABIYEN return URL.

## Failure handling and manual reconciliation

Webhook processing uses an idempotent inbox with event ID, retry count, lease, processed/failed status and a stable `last_error_code`. Transient failures (including JABIYEN database or SMTP outages) return a retryable error; Stripe can redeliver the event, and each fulfillment/email operation is idempotent. The admin's central payment history plus the central webhook inbox should be used to locate the affected payment request and error code.

For an operational retry, verify that the central webhook endpoint is healthy and resend the original Stripe event from the matching test/live Stripe Dashboard. The handler repeats signature, session metadata, owner, project, USD amount and currency verification before any state change. If the event reports an amount/proof mismatch, do not mark the request paid or edit its immutable amount. Compare the Stripe Checkout Session and the central request; if Stripe actually captured a discrepant amount, resolve or refund it in Stripe and record the incident. A failed or unconfirmed transaction must remain unpaid until Stripe's verified data matches the saved order.

## Central database tables

`payment_provider_settings` stores non-secret mode and merchant eligibility settings. `payment_site_settings` controls site enablement, USD currency, checkout paths and the configured order-return destination. `payment_requests` stores the owner, site/order reference, immutable final amount in USD minor units, item snapshot and fulfillment state. `payment_attempts` stores Checkout Session IDs and statuses. `payment_customers` maps Central Auth users to Stripe Customer IDs without saving card details. `payment_webhook_events` is the idempotent Stripe event inbox. `payment_return_handoffs` stores only hashed, expiring, single-use return capabilities.

`order_confirmation_email_deliveries` is a service-role-only central ledger that deduplicates JABIYEN order confirmation messages and records delivery attempts. The admin history remains a read-only joined view of normalized central records, including site, account, external order reference, amount/currency, payment status and timestamps; it never exposes card data.

## Production configuration

Set these only in the **`api-binzeo` Vercel project → Production** environment:

| Variable | Value / use |
| --- | --- |
| `STRIPE_SECRET_KEY` | The merchant account secret matching the selected mode (`sk_test_...` or `sk_live_...`). Never use a publishable key. |
| `STRIPE_WEBHOOK_SECRET` | The `whsec_...` signing secret for the matching mode's webhook endpoint. |
| `STRIPE_LIVE_CHARGES_ENABLED` | Keep `false` until live mode is intentionally approved; it must be explicitly set to `true` before real charges are allowed. |

The central API also needs its existing central and JABIYEN Supabase service-role configuration. Secret values must remain in the encrypted deployment environment and must never be pasted into chat or committed.

## Migrations and release checks

Apply `supabase/migrations/20261025110000_secure_payment_fulfillment_handoffs.sql` only to the central Auth Supabase project. Apply `supabase/jabiyen/migrations/20261025110000_confirm_stripe_orders_from_central_webhook.sql` only to the JABIYEN Supabase project. The JABIYEN migration enables Stripe state transitions, preserves legacy currency rows while making new/settled rows USD, and installs the central-only fulfillment RPC. Do not deploy the code before both migrations are applied and the central `payment_site_settings.order_return_origin` is present in the JABIYEN project origin allowlist.

Before enabling customer checkout, run API security/regression tests and all three repositories' typechecks/builds. Verify the full test-mode flow: a matching signed webhook updates the central request, JABIYEN order/payment, email ledger and fulfillment status; the Auth button then creates a return token; the JABIYEN page redeems it once; a second redemption and an altered amount are rejected. The central live-charge gate must remain off unless live configuration has been separately confirmed.
