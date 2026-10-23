# BINZEO Central API

Central, versioned server-side API for the BINZEO ecosystem. `auth.binzeo` remains the identity/sign-in experience and `admin.binzeo` remains a separate console; both are UI-only clients. All identity, database, provider, email, upload and scheduled-job operations run through this project. Additional products can be connected later through explicit server-side adapters, not arbitrary client-provided URLs.

## Architecture

- One Vercel-deployable TypeScript/Next.js **modular monolith** with isolated identity, user, admin, privacy, communications, security, registry and database modules.
- `auth` and `admin` are registered UI clients. Their `/api/*` paths are unconditionally rewritten to this service; `CENTRAL_API_BASE_URL` is required at build/runtime.
- Frontend repositories contain no local API route handlers, Supabase clients, service-role secrets or local-database fallback. If the Central API is unavailable or unconfigured, pages fail closed with HTTP 503 and API requests fail; neither frontend reconnects to Supabase independently.
- This repository is the single source of truth for the shared Supabase schema and migrations. The frontend repositories contain no database migrations or server-side database scripts.
- Multi-project metadata is held in `platform_projects`, `platform_clients`, `platform_provider_connections` and `platform_project_access`. The typed catalog in `src/platform/registry/registry.ts` maps enabled projects/providers to server-only environment-variable names without storing secret values in the database.
- Authenticated server-rendered profile/dashboard reads and admin dashboard, user, Auth-user directory, deleted-email archive, audit, security, settings, table-browser, privacy-analytics, marketing, birthdays and occasion-email operations use the Central API exclusively.
- Canonical public paths are `/v1/*`; legacy handler paths are internal rewrite targets. OpenAPI is generated from route handlers and served at `/v1/openapi`.

## Repository layout

`src/app` is intentionally kept as the small Next.js routing layer: each `route.ts` only re-exports HTTP methods from its owning site module and keeps framework-required route config. Business logic is not duplicated there.

```text
src/
  app/                         # Next.js route adapters; public URL map only
  platform/                    # genuinely shared server code
    auth/ http/ security/       # identity primitives, response/request policy
    database/supabase/          # shared Supabase client factories
    registry/                  # project/client/provider registry
    server/routes/              # health, OpenAPI and platform endpoints
    openapi.generated.json     # generated API contract
  sites/
    binzeo/                     # BINZEO identity, user and admin implementation
      auth/ admin/ server/routes/
    jabiyen/                    # JABIYEN-specific implementation
      admin/ user/ server/routes/
  proxy.ts                      # Next.js-required request-policy entrypoint
supabase/
  migrations/                  # central BINZEO database migrations (CLI default)
  jabiyen/migrations/          # separate JABIYEN database migrations
tests/
  platform/                    # shared platform tests
  sites/binzeo/ sites/jabiyen/ # site-owned tests
```

**Ownership rule:** site-specific APIs, auth and business rules belong under `src/sites/<site-key>/`; shared code belongs under `src/platform/` only when used by multiple sites. `src/app/` remains organized by Next.js URL and route-group constraints. Put each endpoint's implementation in its site module and keep its App Router file as a small adapter. Tests mirror the same platform/site ownership.

## Centralized route inventory

The service contains the unique backend handlers from both repositories. Admin route files that only proxied to auth handlers use the single central implementation. Additional central endpoints support OAuth/PKCE SSO and server-rendered admin data access. The generated OpenAPI document is the source of truth for route coverage.

Route families include auth and account security; profiles, users, addresses, contacts and devices; sectors; privacy/consent/events; admin user management, audit, dashboard summaries, allowlisted data-table browsing, privacy analytics, security history, settings references, email templates, marketing and scheduled birthday email processing.

## Adding a future brand or application

1. Register the brand in `platform_projects` and its web/admin/mobile clients in `platform_clients`.
2. Register Google, Facebook, Apple, SMTP, ImageKit or other integrations in `platform_provider_connections` using environment-variable **names only**; put actual credentials in the Central API Vercel environment.
3. Add project-scoped roles and permissions in `platform_project_access`; do not overload global `admin_access` for a new brand.
4. Add the exact HTTPS origins and redirect URIs, then add a typed server adapter before enabling routes.
5. Create `src/sites/<project-key>/` with only that project's implementation and tests. Add a thin `src/app/` adapter for each public route and keep the public URL under an explicit namespace such as `/v1/projects/{project_key}/...`; never accept arbitrary database targets or client-provided secret references.

## Central SSO

Admin email/password sign-in and optional 2FA are handled directly by the Central API; Google login/signup from the Auth UI also uses Central API OAuth handlers. A separate Authorization Code + PKCE SSO capability remains in the API for future client applications; it is not needed for the current Admin login and its migration/key are not part of this cutover.

## Security boundaries

- Server-side Supabase Auth verification; `Origin`, project ID and client input are never authentication.
- User-scoped queries preserve RLS; privileged service-role operations stay in the server-only API environment and require authorization first.
- Exact HTTPS-origin CORS allowlist; wildcard CORS is not supported.
- Admin table browsing uses a server-owned table/column allowlist and explicit permission checks. Privacy analytics has a separate role gate and explicit column list.
- Database URLs/secrets come only from the typed registry/environment allowlist; requests cannot choose arbitrary database targets.
- Errors include a request ID but do not expose provider/database internals. Tokens, OTPs and passkey challenges must not be logged.
- Shared distributed rate limiting uses the existing `consume_api_rate_limit` database RPC. If that protection is not available, protected operations fail closed where rate limiting is required.

## Local development and verification

```bash
cp .env.example .env.local
npm ci
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
```

The build generates `src/platform/openapi.generated.json`. Tests are grouped by platform/site and cover registry and admin-table allowlisting, PKCE code primitives, encrypted session payloads and OpenAPI-to-route completeness. Tests do not write to production Supabase.

## Manual deployment and cutover

Deploy this repository as the dedicated `api.binzeo` Vercel project (Node.js 22). Set the variables in that project's Vercel environment; never commit secret values.

1. In the central API project configure `AUTH_SUPABASE_URL`, `AUTH_SUPABASE_ANON_KEY`, `AUTH_SUPABASE_SERVICE_ROLE_KEY`, `API_ALLOWED_ORIGINS` (exact deployed auth/admin origins, comma-separated), `API_ENVIRONMENT=production`, `AUTH_APP_URL`, `ADMIN_APP_URL`, and `WEBAUTHN_RP_ID`.
2. Add provider secrets **only here**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`; SMTP `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`; ImageKit `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT`; and `CRON_SECRET`. Generate secrets in their provider and never copy them into either frontend project.
3. Deploy the central API first. Verify `GET /v1/health` and `GET /v1/openapi`, then test user/admin login, signup, Google OAuth, session, uploads and admin endpoints. Confirm the exact deployed frontend origins are allowlisted.
4. Each frontend Vercel project needs only `CENTRAL_API_BASE_URL` (the HTTPS Central API URL) plus its own public-site metadata such as `NEXT_PUBLIC_SITE_URL`. It must not contain Supabase, Google OAuth, SMTP, ImageKit, Cloudinary or cron credentials. The rewrite is unconditional; no `CENTRAL_API_ENABLED` flag exists.
5. The birthday cron is defined only in this project's `vercel.json` at `/api/internal/birthday-emails` (`0 1 * * *`). It requires the matching central `CRON_SECRET`; the Auth/Admin frontend projects do not schedule backend jobs.
6. This is a one-way central cutover: local API route handlers and database clients were removed from both frontends. If the central service is down or not configured, the websites stay unavailable rather than reconnecting to their former backend paths. Recovery requires restoring the Central API service, not switching to a frontend database fallback.

## JABIYEN centralization

JABIYEN Website and JABIYEN Admin no longer deploy local `api/index.js` servers. Their public content and admin CRUD requests are served by the Central API through bounded ownership namespaces under `src/sites/jabiyen`:

- `/v1/projects/jabiyen/public/*` — canonical public JABIYEN catalog/content APIs
- `/v1/projects/jabiyen/admin/*` — canonical authenticated JABIYEN admin CRUD APIs
- `/api/jabiyen-public/*` — public JABIYEN catalog/content APIs
- `/api/jabiyen-admin/*` — authenticated JABIYEN admin CRUD APIs
- `/v1/auth/*`, `/v1/user/*`, `/v1/admin/*` — Central BINZEO authentication, user and admin APIs

The `/api/jabiyen-*` paths are compatibility aliases only; they are rewritten to the canonical Next.js route adapters. The source ownership boundaries are explicit:
```text
src/sites/binzeo/admin/               # BINZEO admin modules and data access
src/sites/binzeo/auth/                # BINZEO identity, profile and security
src/sites/binzeo/server/routes/       # BINZEO API implementation modules
src/sites/jabiyen/admin/              # JABIYEN admin/catalog/order handlers
src/sites/jabiyen/user/               # JABIYEN config/database/domain modules
src/sites/jabiyen/server/routes/      # JABIYEN API implementation modules
src/platform/auth/ http/ security/    # shared request/auth primitives
src/platform/database/supabase/       # shared Supabase client factories
src/platform/registry/                # cross-project registry/contracts
src/app/                              # thin Next.js URL-to-module adapters
```

The JABIYEN Supabase project remains a separate database. Only the Central API may access it. Add these Vercel environment variables to `api-binzeo` before deploying the gateway:

- `JABIYEN_SUPABASE_URL` — `https://eiueitoxxqzkolsouuzy.supabase.co`
- `JABIYEN_SUPABASE_ANON_KEY` — JABIYEN public read key
- `JABIYEN_SUPABASE_SERVICE_ROLE_KEY` — JABIYEN server-only write key; never expose it to either frontend

The Central Auth variables remain required as before:

- `AUTH_SUPABASE_URL`
- `AUTH_SUPABASE_ANON_KEY`
- `AUTH_SUPABASE_SERVICE_ROLE_KEY`

JABIYEN commerce/content data is accessed only by the Central API. The current JABIYEN admin sign-in and active-admin lookup implementation lives under `src/sites/jabiyen/admin/`; keep its authorization authority and role policy aligned with the intended central security model when changing it.
