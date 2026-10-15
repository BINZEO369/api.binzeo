import { getAdminApiContext, hasAdminPermission } from "@/modules/admin/lib/admin";
import { getSupabaseAdmin } from "@/modules/identity/lib/supabase/admin";
import { fail, ok } from "@/modules/admin/lib/api/response";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 100;

type AuthUserRow = {
  id: string;
  email: string | null;
  phone: string | null;
  email_confirmed_at: string | null;
  phone_confirmed_at: string | null;
  app_metadata: { provider?: string; providers?: string[] };
  created_at: string | null;
  last_sign_in_at: string | null;
  banned_until: string | null;
};

export async function GET(request: Request) {
  const context = await getAdminApiContext(request);
  if (!context.user || !context.access) return fail("An active admin session is required", 401, "ADMIN_REQUIRED");
  if (!hasAdminPermission(context.access, "auth.read")) return fail("Authentication metadata permission required", 403, "AUTH_READ_REQUIRED");

  const url = new URL(request.url);
  const requestedPage = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  const page = Number.isFinite(requestedPage) ? Math.min(10000, Math.max(1, requestedPage)) : 1;
  const query = (url.searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 80);

  const { data, error } = await getSupabaseAdmin().auth.admin.listUsers({ page, perPage: PAGE_SIZE });
  if (error) return fail("Authentication accounts could not be loaded", 500, "AUTH_USERS_FETCH_FAILED");

  const users: AuthUserRow[] = (data.users ?? []).map((user) => ({
    id: user.id,
    email: user.email ?? null,
    phone: user.phone ?? null,
    email_confirmed_at: user.email_confirmed_at ?? null,
    phone_confirmed_at: user.phone_confirmed_at ?? null,
    app_metadata: {
      ...(typeof user.app_metadata?.provider === "string" ? { provider: user.app_metadata.provider } : {}),
      ...(Array.isArray(user.app_metadata?.providers) ? { providers: user.app_metadata.providers.filter((provider): provider is string => typeof provider === "string") } : {}),
    },
    created_at: user.created_at ?? null,
    last_sign_in_at: user.last_sign_in_at ?? null,
    banned_until: user.banned_until ?? null,
  })).filter((user) => !query || `${user.email ?? ""} ${user.phone ?? ""} ${user.id}`.toLowerCase().includes(query));

  return ok({ page, per_page: PAGE_SIZE, has_next_page: (data.users ?? []).length === PAGE_SIZE, users });
}
