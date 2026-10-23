# Central payments

## Scope and deployment state

The payment service belongs to the central `api.binzeo` server and the shared Central Auth Supabase project. Its schema is in `supabase/migrations`; it does not belong in `supabase/jabiyen/migrations` or in an individual website repository. One central Stripe account is used initially. The central provider metadata is configured for the user-confirmed US business country and USD currency in live mode, but the provider and every site remain disabled until a live Stripe account, credentials, account eligibility, and a trusted site adapter are verified.

This is a backend foundation only. No website is connected in this phase, and no live charge can be made. JABIYEN is not ready to be enabled: its current checkout is cash-on-delivery, and delivery fee/total may be unknown when the order is created. A JABIYEN adapter must wait until its final payable amount is fixed server-side.

## Trust and amount rules

The customer must present a Central Auth bearer token. The API verifies it through `authenticateBearerToken` and takes the user ID, verified email, and profile name from the returned identity. Client-supplied user IDs, names, emails, prices, currencies, Stripe IDs, and payment statuses are rejected or ignored; checkout accepts only a centrally-created `payment_request_id` and an idempotency key.

A trusted site adapter in the central server creates a payment request only after it has loaded the site's order from an authoritative server-side source, confirmed that the order belongs to the authenticated user, finalized shipping/tax/discounts, and computed the total. It calls the server-only `createPaymentRequest` helper; there is intentionally no browser-facing endpoint that accepts arbitrary totals. Each line-item snapshot is checked against the stored total and then locked by a database trigger. Future websites should add a small site-specific order adapter which calls this common service rather than implementing Stripe separately.

The payment service creates/reuses a Stripe Customer using the verified Central Auth email and profile name. It does not store card data, request saved-card consent, or set up reusable payment methods. The user's internal Central Auth ID is used for ownership and limited Stripe metadata.

## API contract

- `POST /v1/payments/checkout-sessions` — bearer-authenticated; body: `{ "payment_request_id": "<uuid>", "idempotency_key": "<uuid>" }`. Returns a Stripe-hosted Checkout URL. No amount, user identity, or return URL is accepted from the browser.
- `GET /v1/payments/requests/{requestId}` — bearer-authenticated; returns status only to the owner of the payment request.
- `POST /v1/payments/stripe/webhook` — no bearer token; requires the Stripe `Stripe-Signature` header and verifies the unmodified raw body using `STRIPE_WEBHOOK_SECRET`.

The return URL is built from a site's registered `platform_projects.allowed_origins` plus relative paths in `payment_site_settings`; it is never taken from the checkout request. A success redirect is not evidence of payment. Only a verified Stripe webhook can mark a payment request paid, and Stripe amount/currency are checked against the immutable server-side snapshot before the database changes.

## Central database tables

`payment_provider_settings` holds only non-secret global mode, enabled state, merchant country, and default currency. `payment_site_settings` controls per-site enablement, currency, and safe relative return paths. `payment_requests` contains the owner, site/order reference, final amount in Stripe minor units, currency, and immutable line-item snapshot. `payment_attempts` records Checkout Session IDs and statuses. `payment_customers` maps Central Auth users to Stripe Customer IDs and account email/name snapshots; it contains no payment methods. `payment_webhook_events` is a deduplicated webhook inbox with processing leases; raw webhook payloads are not stored.

All payment tables have RLS enabled and are accessible only to the central server's `service_role`. No Stripe secret value is stored in the database, registry, response, or logs.

## Server configuration

Provision the live `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` only in the central API deployment's server-side secret environment. The provider row and site rows remain disabled until those credentials, the live account, webhook delivery, and site checkout behavior are confirmed. `STRIPE_LIVE_CHARGES_ENABLED` is an explicit additional live-mode guard and is set to `false` in the example environment. Test/live mode in the database must match the `sk_test_`/`sk_live_` secret prefix. A live key by itself cannot enable live payments.

The user has confirmed the business country is the United States, and central metadata is set to US/USD. The currently connected Stripe MCP account is only a test sandbox, so the actual live account's legal country, currency, and eligibility still need to be confirmed before activation. JABIYEN's current BDT checkout currency is not enabled by this USD configuration and would require separate account-specific review.

## Applying and extending

The migration `supabase/migrations/20261023192000_central_stripe_payments.sql` has already been applied to the current central Supabase project. Keep the migration in source control for reproducibility in other environments; do not apply it to the JABIYEN project. To add a site later, register its project and allowed origins centrally, create its payment-site settings, implement an order adapter in `api.binzeo`, and test using Stripe test credentials and signed webhook fixtures before enabling checkout. Refund/dispute workflows and cross-site saved payment methods are out of scope for this foundation.
