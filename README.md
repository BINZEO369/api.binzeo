# BINZEO Central API

Central, versioned server-side API for the BINZEO ecosystem. `auth.binzeo` remains the identity/sign-in experience and `admin.binzeo` remains a separate console; both are UI-only clients. All identity, database, provider, email, upload and scheduled-job operations run through this project. Additional products can be connected later through explicit server-side adapters, not arbitrary client-provided URLs.

## Architecture

- One Vercel-deployable TypeScript/Next.js **modular monolith** with isolated identity, user, admin, privacy, communications, security, registry and database modules.
- `auth` and `admin` are registered UI clients. Their `/api/*` paths are unconditionally rewritten to this service; `CENTRAL_API_BASE_URL` is required at build/runtime.
- Frontend repositories contain no local API route handlers, Supabase clients, service-role secrets or local-database fallback. If the Central API is unavailable or unconfigured, pages fail closed with HTTP 503 and API requests fail; neither frontend reconnects to Supabase independently.
- Authenticated server-rendered profile/dashboard reads and admin dashboard, user, Auth-user directory, deleted-email archive, audit, security, settings, table-browser, privacy-analytics, marketing, birthdays and occasion-email operations use the Central API exclusively.
- Canonical public paths are `/v1/*`; legacy handler paths are internal rewrite targets. OpenAPI is generated from route handlers and served at `/v1/openapi`.

## Centralized route inventory

The service contains the unique backend handlers from both repositories. Admin route files that only proxied to auth handlers use the single central implementation. Additional central endpoints support OAuth/PKCE SSO and server-rendered admin data access. The generated OpenAPI document is the source of truth for route coverage.

Route families include auth and account security; profiles, users, addresses, contacts and devices; sectors; privacy/consent/events; admin user management, audit, dashboard summaries, allowlisted data-table browsing, privacy analytics, security history, settings references, email templates, marketing and scheduled birthday email processing.

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

The build generates `src/openapi.generated.json`. Tests cover registry and admin-table allowlisting, PKCE code primitives, encrypted session payloads and OpenAPI-to-route completeness. Tests do not write to production Supabase.

## Manual deployment and cutover

Deploy this repository as the dedicated `api.binzeo` Vercel project (Node.js 22). Set the variables in that project's Vercel environment; never commit secret values.

1. In the central API project configure `AUTH_SUPABASE_URL`, `AUTH_SUPABASE_ANON_KEY`, `AUTH_SUPABASE_SERVICE_ROLE_KEY`, `API_ALLOWED_ORIGINS` (exact deployed auth/admin origins, comma-separated), `API_ENVIRONMENT=production`, `AUTH_APP_URL`, `ADMIN_APP_URL`, and `WEBAUTHN_RP_ID`.
2. Add provider secrets **only here**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`; SMTP `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`; ImageKit `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_URL_ENDPOINT`; and `CRON_SECRET`. Generate secrets in their provider and never copy them into either frontend project.
3. Deploy the central API first. Verify `GET /v1/health` and `GET /v1/openapi`, then test user/admin login, signup, Google OAuth, session, uploads and admin endpoints. Confirm the exact deployed frontend origins are allowlisted.
4. Each frontend Vercel project needs only `CENTRAL_API_BASE_URL` (the HTTPS Central API URL) plus its own public-site metadata such as `NEXT_PUBLIC_SITE_URL`. It must not contain Supabase, Google OAuth, SMTP, ImageKit, Cloudinary or cron credentials. The rewrite is unconditional; no `CENTRAL_API_ENABLED` flag exists.
5. The birthday cron is defined only in this project's `vercel.json` at `/api/internal/birthday-emails` (`0 1 * * *`). It requires the matching central `CRON_SECRET`; the Auth/Admin frontend projects do not schedule backend jobs.
6. This is a one-way central cutover: local API route handlers and database clients were removed from both frontends. If the central service is down or not configured, the websites stay unavailable rather than reconnecting to their former backend paths. Recovery requires restoring the Central API service, not switching to a frontend database fallback.
