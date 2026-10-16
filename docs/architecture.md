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

- `src/app/(admin)`: the single main Next.js route group for BINZEO Admin and JABIYEN Admin endpoints.
- `src/app/(user)`: the single main Next.js route group for Auth, User and JABIYEN public endpoints.
- `src/app/(system)`: health, OpenAPI and other platform-level endpoints.
- Parenthesized folders are Next.js route groups: they organize the tree without changing the public URL. Each HTTP route file exists once; no wrapper or duplicate route tree is created.
- `src/user/auth`: all Central Auth, user, profile, security, email and identity-provider implementation modules.
- `src/admin/binzeo`: all BINZEO admin access/data implementation modules and server-owned table allowlists.
- `src/admin/binzeo/privacy-analytics`: separate allowlisted privacy data tables and column projection.
- `src/admin/<project-key>` and `src/user/<project-key>`: bounded project-owned implementation modules. A business implementation has one canonical location; it is never duplicated under `src/app`.
- `src/shared/platform`: cross-project registry, clients, providers and project access rules.
- `src/providers`: shared email, OAuth, storage and database provider clients used by every project.
- `src/lib/http`: request IDs, response/error contract.
- `src/lib/security`: CORS, rate limits, request policy.
- `src/lib/supabase`: user-scoped and privileged connections.
- `src/lib/auth`: central token verification and PKCE SSO code handling.
- `supabase/migrations`: reviewable schema changes; never auto-applied by build/deploy.

## Frontend integration

`auth.binzeo`, `admin.binzeo`, `JABIYEN-WEBSITE` and `JABIYEN-ADMIN` remain separately deployed frontend applications. Their `/api/*` requests rewrite to fixed central endpoints. The browser never receives a central or project database service-role key.

JABIYEN is the first bounded project implementation, split by ownership:

- `src/user/jabiyen/config` — project identity and public origins.
- `src/user/jabiyen/database` — public and service-role Supabase clients.
- `src/user/jabiyen/domain` — project-level contract and client ownership.
- `src/admin/jabiyen` — public/admin composition roots, shared context and a small number of domain-sized handlers (catalog, navigation, content, products, variants, footer/home); no route-per-file explosion.
- `src/user/jabiyen/customer-sync.ts` — Central Auth to JABIYEN customer mirror.
- `src/app/(admin)/api/v1/projects/jabiyen/admin` — the single JABIYEN Admin route entrypoint.
- `src/app/(user)/api/v1/projects/jabiyen/public` — the single JABIYEN public website route entrypoint.
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
