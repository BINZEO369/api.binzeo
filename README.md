# BINZEO Central API

Central, versioned server-side API for the BINZEO ecosystem. `auth.binzeo` remains the identity/sign-in experience; `admin.binzeo` remains a separate admin console. Both applications currently share one Supabase identity database. Additional products can be connected later through explicit server-side adapters, not arbitrary client-provided URLs.

## Architecture

- One Vercel-deployable TypeScript/Next.js **modular monolith** with isolated identity, user, admin, privacy, communications, security, registry and database modules.
- `auth` and `admin` are registered client applications that currently share one Supabase identity database.
- Both frontends have feature-flagged `/api/*` rewrites to the central service. `CENTRAL_API_ENABLED` defaults to `false`; their existing behavior remains available until the API is manually deployed, configured and explicitly enabled.
- Authenticated server-rendered profile/dashboard reads and admin dashboard, user, audit, security, settings, table-browser, privacy-analytics and deleted-account archive reads use central API endpoints when the flag is enabled.
- Canonical public paths are `/v1/*`; legacy handler paths are internal rewrite targets. OpenAPI is generated from route handlers and served at `/v1/openapi`.

## Centralized route inventory

The service contains the unique backend handlers from both repositories. Admin route files that only proxied to auth handlers use the single central implementation. Additional central endpoints support OAuth/PKCE SSO and server-rendered admin data access. The generated OpenAPI document is the source of truth for route coverage.

Route families include auth and account security; profiles, users, addresses, contacts and devices; sectors; privacy/consent/events; admin user management, audit, dashboard summaries, allowlisted data-table browsing, privacy analytics, security history, settings references, email templates, marketing and scheduled birthday email processing.

## Central SSO

The admin login can be switched to `auth.binzeo` through a short-lived Authorization Code + PKCE flow. Codes are hashed in the database, single-use and short-lived; the Supabase access/refresh token pair is AES-GCM encrypted at rest. The callback URL is exact-allowlisted. The migration is supplied in `supabase/migrations/` and is **not applied automatically**.

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

No Vercel project is created and no deployment is performed by this repository change. Use a **separate Vercel project** connected to `BINZEO369/api.binzeo`, with Node.js 22. Set all variables in the project’s Vercel environment; never commit actual secret values.

1. In the central API project, configure `AUTH_SUPABASE_URL`, `AUTH_SUPABASE_ANON_KEY`, `AUTH_SUPABASE_SERVICE_ROLE_KEY`, `API_ALLOWED_ORIGINS` (exact deployed auth/admin origins, comma-separated), `API_ENVIRONMENT=production`, `AUTH_APP_URL`, `ADMIN_APP_URL`, `WEBAUTHN_RP_ID`, and a newly generated `CENTRAL_OAUTH_ENCRYPTION_KEY`. Add provider/SMTP/ImageKit/cron variables only for features that use them.
2. Review and manually apply `supabase/migrations/20261015120000_central_authorization_codes.sql` to the existing shared Supabase project before enabling central SSO. No migration is automatically applied by build or deploy.
3. Deploy the central API first. Verify `GET /v1/health` and `GET /v1/openapi`, then test authenticated user and admin endpoints with real sessions. Confirm CORS uses the actual deployed frontend origins.
4. In each frontend Vercel project, set `CENTRAL_API_BASE_URL` to the **actual HTTPS API deployment URL** and set `CENTRAL_API_ENABLED=true`; redeploy the frontend so Next.js applies the rewrites. The value of `NEXT_PUBLIC_CENTRAL_API_ENABLED` is derived by each `next.config.ts` and should not be used to expose secrets.
5. Cut over one frontend at a time. Test login/logout, OAuth/PKCE admin SSO, profile updates, admin permissions, user detail pages, audit/security views, data-table pagination, privacy analytics, scheduled birthday email, and request IDs. Verify unauthorized roles remain denied.
6. Keep the existing auth Vercel cron as the single birthday-email schedule. Do not add a second central cron. Confirm the central API has the matching `CRON_SECRET`.
7. Rollback by setting `CENTRAL_API_ENABLED=false` and redeploying the affected frontend(s). This returns frontend API routes and server-rendered data reads to their existing implementation; the central API and database migration remain untouched.

Keep frontend Supabase session configuration until the deployed flow has been verified. Do not enable the feature flag before the central API is deployed and healthy.
