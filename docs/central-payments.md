# Central payments

## Customer flow and ownership

The customer places an order on JABIYEN. Its order-confirmation screen contains only a link to `https://auth-binzeo.vercel.app/payment?order_number=...`; JABIYEN does not collect card data, create Stripe sessions, or store Stripe payment records. The customer signs in to Central Auth, sees the order number on the Auth payment page, and clicks **Pay securely with Stripe**. Auth sends only the order number and the Central Auth session to `api.binzeo`; the central server verifies the order and creates a hosted Stripe Checkout Session. Stripe card entry happens on Stripe's domain.

All payment configuration, requests, attempts, Stripe Customer mappings, and webhook inbox records are stored in the central Auth Supabase database. JABIYEN's separate database remains the source of its order, item, shipping-fee, and admin-managed currency-rate data; the central adapter reads those values server-side and never writes Stripe payment state to JABIYEN.

The central payment provider is configured for the user-selected United States / USD setup. The connected Stripe MCP account is a test sandbox, not the user's live merchant account. Production charges remain blocked by `STRIPE_LIVE_CHARGES_ENABLED=false` until the real live Stripe credentials and webhook signing secret are added to the central Vercel project and the gate is intentionally changed.

## Server-side trust and amount rules

The Auth payment page is protected by Central Auth. The central API accepts the Auth app's signed session only from the configured `AUTH_APP_URL` origin (or an authenticated Central Auth bearer token for server integrations). It derives the user ID, verified email, and profile name from Central Auth; the browser cannot submit a price, currency, customer identity, Stripe ID, or return URL.

For JABIYEN, the central adapter loads the order by order number, matches the order email to the signed-in account's verified email, rejects cancelled/returned or already-collected orders, requires confirmed delivery fees, and checks stored item line totals, subtotal, shipping, and total arithmetically. It converts the finalized BDT total to USD using the active JABIYEN USD rate and saves an immutable USD amount and order snapshot in the central payment tables. If any input is missing, inconsistent, unpaid status is not clear, or the rate is unavailable, checkout fails closed.

The payment service uses the verified Central Auth email and profile name to create/reuse a Stripe Customer. It does not store card data or set up reusable payment methods. Only a verified Stripe webhook can mark a request paid; a return redirect is not proof of payment.

## API contract

- `POST /v1/payments/jabiyen/checkout-sessions` — Authenticated by the Central Auth session or bearer identity. Accepts only `{ "order_number": "..." }`; returns a Stripe-hosted Checkout URL after the central adapter verifies the order.
- `POST /v1/payments/checkout-sessions` — Trusted server-side integrations using an already-created central payment request; accepts only its request ID and idempotency key.
- `GET /v1/payments/requests/{requestId}` — Authenticated, owner-scoped payment status.
- `POST /v1/payments/stripe/webhook` — Stripe signature-authenticated endpoint; verifies the unmodified raw body using `STRIPE_WEBHOOK_SECRET`.

The central API constructs success/cancel return URLs from `payment_site_settings` and registered `platform_projects.allowed_origins`; neither is accepted from the browser. Stripe Checkout is hosted at `checkout.stripe.com`.

## Central database tables

`payment_provider_settings` stores only non-secret global mode, enablement, merchant country, and default currency. `payment_site_settings` controls per-site enablement, currency, and safe relative return paths. `payment_requests` stores owner, site/order reference, final amount in Stripe minor units, currency, and immutable line-item snapshot. `payment_attempts` stores Checkout Session IDs and statuses. `payment_customers` maps Central Auth users to Stripe Customer IDs and account email/name snapshots. `payment_webhook_events` is an idempotent webhook inbox; raw payloads and card data are not stored.

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
