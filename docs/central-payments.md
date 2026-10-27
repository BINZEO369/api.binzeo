# Central payments

## Customer flow and ownership

The customer selects Cash on Delivery or Stripe during JABIYEN checkout. For Stripe, JABIYEN submits the order through its server API and redirects the customer to the central BINZEO Auth payment page. JABIYEN never creates a Stripe Checkout Session or trusts browser-supplied prices. The central server reads the saved order and account identity, checks that the order belongs to the signed-in customer, and creates a hosted Stripe Checkout Session. Card entry remains on Stripe's domain.

The signed Stripe webhook is the source of payment truth. After it verifies the Checkout Session against the immutable central request (request ID, account, site, amount, currency and Stripe metadata), the central server calls a service-role-only, idempotent JABIYEN database function. That transaction changes the JABIYEN order/payment records to confirmed/collected. This fulfillment continues even if the customer's browser closes or loses internet access. Confirmation emails are sent only after this server-side order update succeeds. A Stripe event that arrives before its Checkout Session ID has been persisted is returned as retryable rather than silently acknowledged; Stripe redelivery can complete it after the write lands.

After Central Auth sees both `payment_requests.status = 'paid'` and `fulfillment_status = 'fulfilled'`, it can issue a short-lived one-time return link. The raw random token is returned only to the authenticated customer, stored in the central database as a SHA-256 hash, and placed in the URL fragment (not sent in HTTP requests or Referer headers). JABIYEN immediately removes the fragment from browser history and redeems the token through a same-origin API request. Central redemption verifies the central payment and the JABIYEN order first, then atomically consumes the token immediately before returning the order. A transient order-database failure therefore does not burn a valid token. Expired or replayed tokens are rejected; customers can request a fresh token from Auth.

## USD-only payment policy

All new central payment requests and Stripe charges use USD. JABIYEN product, shipping and saved order totals are treated as USD amounts without exchange-rate conversion. The central payment record is denominated in USD cents. Stripe Checkout Adaptive Pricing is explicitly disabled so the customer is not offered a converted BDT or other local-currency presentment. The JABIYEN Stripe fulfillment RPC compares the saved USD total against the immutable central amount before it confirms the order. Database constraints enforce USD on provider defaults, enabled site currency, payment requests and payment attempts. Historical legacy currency labels in JABIYEN remain tolerated only to preserve existing rows; new orders and Stripe-settled rows are stored as USD.

## Website allowlist (central database)

`payment_site_settings.enabled` is the explicit per-site allowlist switch. It defaults to `false`; a missing settings row is also denied. Checkout additionally requires an active `platform_projects` entry, a registered allowed origin, an enabled central Stripe provider, and USD currency. Only the JABIYEN site is enabled in the current baseline. The `binzeo` project has no enabled site-payment settings, so it cannot create checkout sessions. The JABIYEN origin list is restricted to the user-confirmed `https://jabiyen-website.vercel.app` storefront and `https://auth-binzeo.vercel.app` payment page; previously configured `jayenware.shop` hosts were removed because the user confirmed they are not their domain.

A database administrator can review the allowlist with:

```sql
SELECT p.project_key, p.status, COALESCE(s.enabled, false) AS payments_enabled,
       s.currency, p.allowed_origins
FROM public.platform_projects AS p
LEFT JOIN public.payment_site_settings AS s ON s.project_id = p.id
ORDER BY p.project_key
LIMIT 50;
```

To deliberately enable a future, already registered and active site, create or update its row in the central database. Keep the currency `usd`; confirm its exact website origin has been reviewed and registered before enabling checkout:

```sql
INSERT INTO public.payment_site_settings (project_id, enabled, currency)
SELECT id, true, 'usd'
FROM public.platform_projects
WHERE project_key = 'your-site-key' AND status = 'active'
LIMIT 1
ON CONFLICT (project_id) DO UPDATE
SET enabled = true, currency = 'usd';
```

To disable a site, set its `payment_site_settings.enabled` to `false`. Do not grant browser roles table access; the payment configuration tables remain protected by RLS and service-role-only grants. Enabling a site does not permit it to submit its own amount: the central site adapter must still retrieve and validate the server-side order and account owner.

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

Webhook processing uses an idempotent inbox with event ID, retry count, lease, processed/failed status and a stable `last_error_code`. Transient failures (including an early webhook/attempt-write race, JABIYEN database outage, SMTP outage or temporary network issue) return a retryable error; Stripe can redeliver the event, and fulfillment/email operations are idempotent. The Auth return page rechecks central status with bounded backoff and immediately rechecks when connectivity returns or the page becomes visible. Customers are told not to submit a second payment while status is pending.

For an operational retry of an event recorded as `failed`, verify that the central webhook endpoint is healthy and resend the original Stripe event from the matching test/live Stripe Dashboard. The handler repeats signature, session metadata, owner, project, USD amount and currency verification before any state change. An event already recorded as `processed` is an idempotency receipt; redelivering that same event will not re-run fulfillment. Historical paid rows created before fulfillment tracking may remain `fulfillment_status = 'not_required'`; they are not eligible for a return handoff and must be revalidated against both Stripe and the JABIYEN order after the separate JABIYEN migration is applied. Never toggle a row to `fulfilled` manually. If an event reports an amount/proof mismatch, do not edit its immutable amount. Compare the Stripe Checkout Session and the central request; if Stripe actually captured a discrepant amount, resolve or refund it in Stripe and record the incident. A failed or unconfirmed transaction must remain unpaid until Stripe's verified data matches the saved order.

## Central database tables

`payment_provider_settings` stores non-secret mode and merchant eligibility settings. `payment_site_settings` controls the site allowlist, USD currency, checkout paths and configured order-return destination. `payment_requests` stores the owner, site/order reference, immutable final amount in USD minor units, item snapshot and fulfillment state. `payment_attempts` stores Checkout Session IDs and statuses. `payment_customers` maps Central Auth users to Stripe Customer IDs without saving card details. `payment_webhook_events` is the idempotent Stripe event inbox. `payment_return_handoffs` stores only hashed, expiring, single-use return capabilities.

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

Apply `supabase/migrations/20261025110000_secure_payment_fulfillment_handoffs.sql`, `supabase/migrations/20261026121500_usd_only_payment_allowlist.sql`, and `supabase/migrations/20261027075000_flag_legacy_jabiyen_fulfillment.sql` only to the central Auth Supabase project. The final migration flags older JABIYEN rows for reconciliation without falsely marking any as fulfilled. Apply `supabase/jabiyen/migrations/20261025110000_confirm_stripe_orders_from_central_webhook.sql` only to the separate JABIYEN Supabase project. The JABIYEN migration enables Stripe state transitions, preserves legacy currency rows while making new/settled rows USD, and installs the central-only fulfillment RPC. Do not merge/deploy the API/Auth/JABIYEN release before that separate JABIYEN migration is applied and the central `payment_site_settings.order_return_origin` is present in the JABIYEN project origin allowlist.

Before enabling customer checkout, run API security/regression tests and all three repositories' typechecks/builds. Verify the full test-mode flow: a matching signed webhook updates the central request, JABIYEN order/payment, email ledger and fulfillment status; the Auth button then creates a return token; the JABIYEN page redeems it once; a second redemption and an altered amount are rejected. The central live-charge gate must remain off unless live configuration has been separately confirmed.
