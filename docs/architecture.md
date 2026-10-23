# Architecture Notes

## Deployment shape

Start with one Vercel-deployable TypeScript/Next.js service and strict module boundaries. Do not split into microservices before independent scaling, ownership, or failure isolation is demonstrated. This keeps operations manageable while adapters make future extraction possible.

## Trust boundaries

1. A browser `Origin`, project key, route name, or user-supplied database URL is not authentication.
2. Identity is verified with Supabase Auth using a session cookie relayed by the first-party frontend BFF or a presented bearer access token.
3. Account status and admin role/permission are checked server-side on protected operations.
4. User-scoped queries preserve Supabase RLS. Privileged service-role queries are isolated in server-only modules and must follow explicit authorization.
5. Registry entries map known project identifiers to server-side environment references. Clients cannot choose database endpoints.
6. Secrets are provisioned only in the central API server environment; never in the registry, API response, browser bundle, logs, or Git.

## Module ownership

- `src/app/(admin)`, `src/app/(user)` and `src/app/(system)` are Next.js URL adapters. Route groups organize code without changing public URLs; each route file re-exports methods from its owning implementation module and retains only Next.js route configuration.
- `src/binzeo/auth` owns BINZEO identity, profile, email and account-security logic; `src/binzeo/admin` owns BINZEO admin and its table/privacy allowlists.
- `src/binzeo/api` owns BINZEO API implementations, including `/api/admin`, `/api/auth`, `/api/user` and service-wide `/v1` routes.
- `src/jabiyen/admin`, `src/jabiyen/website` and `src/jabiyen/api` own JABIYEN admin, website configuration/data/domain, and public/admin API implementations respectively.
- `src/common/http`, `src/common/security` and `src/common/database/supabase` contain reusable technical helpers. Keep site-specific business rules in `src/binzeo` or that website's folder.
- `src/binzeo/registry` contains the central server's project/provider registry; `src/binzeo/openapi.generated.json` is build-generated and must not be edited by hand.
- `src/proxy.ts` stays at the Next.js-required discovery path and is the shared request-policy entrypoint.
- `tests/binzeo` and `tests/jabiyen` mirror code ownership. `tests/server-only.ts` is shared test support.
- `supabase/migrations` remains the standard CLI location for the central BINZEO database. `supabase/jabiyen/migrations` belongs to JABIYEN's separate database; migrations are reviewed/applied explicitly, never by a web build.

When adding a website, create `src/<website-name>/` first, with separate `admin/`, `website/` and `api/` areas as needed; put its tests under `tests/<website-name>/`. Add only thin Next.js adapters under `src/app`, with the public namespace mapped deliberately in `next.config.ts` or `vercel.json`. Reuse `src/common` only for low-level code genuinely shared across websites. Do not duplicate a handler in both `src/app` and its website folder.

## Frontend integration

`auth.binzeo`, `admin.binzeo`, `JABIYEN-WEBSITE` and `JABIYEN-ADMIN` remain separately deployed frontend applications. Their `/api/*` requests rewrite to fixed central endpoints. The browser never receives a central or project database service-role key.

- JABIYEN config/database/domain code lives under `src/jabiyen/website`.
- JABIYEN admin/public composition modules live under `src/jabiyen/admin`.
- JABIYEN API implementations live under `src/jabiyen/api`; Next.js URL adapters stay under `src/app/(admin)` and `src/app/(user)`.
- `/v1/projects/jabiyen/public/*` and `/v1/projects/jabiyen/admin/*` — canonical versioned routes.
- `/api/jabiyen-public/*` and `/api/jabiyen-admin/*` — temporary compatibility aliases for existing frontends.

The admin console’s data-table and privacy-analytics pages send only table identifiers and pagination to the API. The API independently validates each identifier against its own allowlist, enforces permission/role checks, chooses the permitted column set, and applies bounded pagination. Dashboard summaries and user detail reads likewise execute on the central server.

## Reliability and evolution

- Keep API v1 contracts stable; use additive changes where possible. Breaking changes receive a new version and a migration window.
- Use idempotency for retried operations that send mail or mutate user state.
- Apply explicit timeouts and bounded pagination; do not fan out unbounded database work.
- Health responses disclose liveness only. Readiness checks must not reveal secrets or internal hostnames.
- Include request IDs in client errors and structured logs while redacting credentials, OTPs, passkey challenges, and unnecessary personal data.
- Keep production cutover reversible: feature-flagged frontend rewrites remain off until the central API is deployed and verified. Existing API behavior is the fallback.
- Migrate scheduled jobs once; never run old and central cron paths simultaneously.

## Current integrations

`auth` and `admin` are client/application registrations sharing the current identity Supabase reference. They are not separate database projects. The admin frontend's API files that only proxied to `auth.binzeo` are consolidated onto the single identity/admin handler. New product integrations receive a distinct allowlisted adapter and environment secret reference; no client may specify a database URL or service key.

## Central payments

Stripe checkout, payment records, and webhook processing belong to the central `api.binzeo` service and `supabase/migrations`. Payment amounts must come from a trusted server-side site adapter and immutable central payment requests; browser requests carry only a request ID and idempotency key. Central Auth supplies customer identity, the server holds Stripe secrets, and a verified webhook—not a success redirect—confirms payment. See [Central payments](central-payments.md) for the API contract and the disabled-by-default setup.
