# Central payments

## Customer flow and ownership

The customer chooses COD or online Stripe in JABIYEN's Payment step. For Stripe, JABIYEN submits its normal order request and then only redirects the browser to `https://auth-binzeo.vercel.app/payment?order_number=...`; it does not create a Stripe session or store card/payment state. The customer signs in to Central Auth, reviews the order number on the Auth payment page, and clicks **Pay securely with Stripe**. Auth sends only the order number and the Central Auth session to `api.binzeo`; the central server verifies the order and creates a hosted Stripe Checkout Session. Stripe card entry happens on Stripe's domain.

All payment configuration, requests, attempts, Stripe Customer mappings, and webhook inbox records are stored in the central Auth Supabase database. JABIYEN's separate database remains the source of its order, item, shipping-fee, and admin-managed currency-rate data; the central adapter reads those values server-side and never writes Stripe payment state to JABIYEN.

The central payment provider is configured for the user-selected United States / USD setup and is currently in shared `test` mode in the central database; all sites use this mode. The connected Stripe MCP account is a test sandbox, not the user's live merchant account. Test checkout requires a test `sk_test_...` key and test webhook signing secret in the `api-binzeo` Vercel Production environment. Real charges remain blocked by `STRIPE_LIVE_CHARGES_ENABLED=false`; before live use, switch the central provider mode to `live`, set the live key and webhook secret, and intentionally change the gate.

Order confirmations use the existing central BINZEO SMTP transport and the shared Welcome-email layout. COD confirmations are sent after the JABIYEN order has been saved. Stripe confirmations are sent only after the signed webhook verifies the payment as paid; a browser return is never used as proof. The central `order_confirmation_email_deliveries` ledger deduplicates confirmations and records delivery attempts. If SMTP temporarily fails, COD order creation remains successful and the delivery is recorded for retry; Stripe webhook failures return a retryable response to Stripe.

Order confirmation emails display money in USD only. Stripe emails show the verified USD amount actually charged. COD emails display the saved JABIYEN order total directly as USD, without an exchange-rate conversion or a local-currency disclaimer.

## Server-side trust and amount rules

The Auth payment page is protected by Central Auth. The central API accepts the Auth app's signed session only from the configured `AUTH_APP_URL` origin (or an authenticated Central Auth bearer token for server integrations). It derives the user ID, verified email, and profile name from Central Auth; the browser cannot submit a price, currency, customer identity, Stripe ID, or return URL.

For JABIYEN, the central adapter loads the order by order number, matches the order email to the signed-in account's verified email, rejects cancelled/returned or already-collected orders, requires confirmed delivery fees, and checks stored item line totals, subtotal, shipping, and total arithmetically. It converts the finalized BDT total to USD using the active JABIYEN USD rate and saves an immutable USD amount and order snapshot in the central payment tables. If any input is missing, inconsistent, unpaid status is not clear, or the rate is unavailable, checkout fails closed.

The payment service uses the verified Central Auth email and profile name to create/reuse a Stripe Customer. It does not store card data or set up reusable payment methods. Only a verified Stripe webhook can mark a request paid; a return redirect is not proof of payment.

## API contract

- `POST /v1/payments/jabiyen/checkout-sessions` — Authenticated by the Central Auth session or bearer identity. Accepts only `{ "order_number": "..." }`; returns a Stripe-hosted Checkout URL after the central adapter verifies the order.
- `POST /v1/payments/checkout-sessions` — Trusted server-side integrations using an already-created central payment request; accepts only its request ID and idempotency key.
- `GET /v1/payments/requests/{requestId}` — Authenticated, owner-scoped payment status.
- `POST /v1/payments/stripe/webhook` — Stripe signature-authenticated endpoint; verifies the unmodified raw body using `STRIPE_WEBHOOK_SECRET`.
- `GET /api/admin/payments` — Admin-only, paginated payment history across registered sites; requires `super_admin` or the dedicated `payments.read` permission. The existing admin dashboard page is `https://admin-binzeo.vercel.app/dashboard/payments`.

The central API constructs success/cancel return URLs from `payment_site_settings` and registered `platform_projects.allowed_origins`; neither is accepted from the browser. Stripe Checkout is hosted at `checkout.stripe.com`.

## Central database tables

`payment_provider_settings` stores only non-secret global mode, enablement, merchant country, and default currency. `payment_site_settings` controls per-site enablement, currency, and safe relative return paths. `payment_requests` stores owner, site/order reference, final amount in Stripe minor units, currency, and immutable line-item snapshot. `payment_attempts` stores Checkout Session IDs and statuses. `payment_customers` maps Central Auth users to Stripe Customer IDs and account email/name snapshots. `payment_webhook_events` is an idempotent Stripe webhook inbox; raw payloads and card data are not stored.

`order_confirmation_email_deliveries` is a service-role-only central ledger that deduplicates JABIYEN order confirmations and records SMTP delivery attempts. It stores delivery status and the recipient address, but never stores card data or SMTP credentials.

The admin history is a read-only joined view of these normalized central records, not a second copy of payment data. It identifies each row by website/project ID and key, Central Auth UUID and BINZEO user ID, external order ID, and central payment-request ID; it shows the charged amount/currency, status, created time, and webhook-confirmed paid time. User name/email are taken from the central payment customer snapshot when present. Card numbers and payment credentials are never exposed. Site and status filters plus bounded pagination are supported.

All payment tables have RLS enabled and are restricted to the central server's `service_role`. Stripe secret values are never stored in the database, registry, API responses, or logs.

## Production configuration

Set these only in the **`api-binzeo` Vercel project → Production** environment:

| Variable | Value / use |
| --- | --- |
| `STRIPE_SECRET_KEY` | The real merchant account's live secret, beginning `sk_live_`. Never use a publishable key. |
| `STRIPE_WEBHOOK_SECRET` | The signing secret beginning `whsec_` for the live webhook endpoint below. |
| `STRIPE_LIVE_CHARGES_ENABLED` | Leave `false` until the live key and webhook are verified; change to `true` only to intentionally allow real charges. It is currently set to `false`. |

Register this URL in the Stripe Dashboard's **live mode**: `https://api-binzeo.vercel.app/v1/payments/stripe/webhook`. Copy its signing secret to `STRIPE_WEBHOOK_SECRET`. The central API's JABIYEN service-role database variables (`JABIYEN_SUPABASE_URL`, `JABIYEN_SUPABASE_SERVICE_ROLE_KEY`) and Auth integration settings must also be correctly populated; their names already exist in the `api-binzeo` Vercel configuration, but secret values were not read. In the `auth-binzeo` project, production `CENTRAL_API_ENABLED=true` and `CENTRAL_API_BASE_URL=https://api-binzeo.vercel.app` are already configured.

A live key alone cannot enable checkout: provider mode, key prefix, webhook secret, and the explicit live-charge gate must all match. Do not paste secrets in chat or commit them to a repository. Use Vercel's encrypted Production environment-variable UI.

## Migrations and extension

- `supabase/migrations/20261023192000_central_stripe_payments.sql` creates the central payment schema and has been applied to the central Supabase project.
- `supabase/migrations/20261023195700_enable_jabiyen_central_checkout.sql` registers the Auth origin and configures the central provider/site for US/USD; the explicit Vercel live gate remains false.

Apply both only to the central Auth Supabase project, never to the JABIYEN project. Future sites should add a small central server-side order adapter, a central project origin, and central site settings; their websites should link customers to the same Auth payment page rather than implement their own Stripe flows. Refund/dispute workflows and saved payment methods are outside this rollout.
