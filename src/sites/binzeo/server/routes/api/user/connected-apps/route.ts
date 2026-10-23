import { NextRequest } from "next/server";
import { createClient } from "@/sites/binzeo/auth/lib/supabase/server";
import { ok, fail } from "@/sites/binzeo/auth/lib/api/response";

type ConnectedAppRow = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  website_url: string | null;
  is_active: boolean;
  created_at: string;
  user_connected_apps?: Array<{
    id: string;
    scopes: unknown;
    connected_at: string;
    disconnected_at: string | null;
    revoked_at: string | null;
  }>;
};

export async function GET() {
  try {
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return fail("Unauthorized", 401, "UNAUTHORIZED");
    const { data, error } = await db.from("connected_apps").select("id,slug,name,logo_url,website_url,is_active,created_at,user_connected_apps(id,scopes,connected_at,disconnected_at,revoked_at)").eq("is_active", true).order("name");
    if (error) return fail(error.message, 400, "CONNECTED_APPS_FETCH_FAILED");
    return ok({ apps: (data ?? []).map((app: ConnectedAppRow) => ({ ...app, connection: app.user_connected_apps?.[0] ?? null, user_connected_apps: undefined })) });
  } catch (error) {
    console.error("[CONNECTED_APPS_GET_ERROR]", error);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return fail("Unauthorized", 401, "UNAUTHORIZED");
    const body = await req.json();
    const appId = typeof body.app_id === "string" ? body.app_id : "";
    if (!appId) return fail("app_id is required", 422, "VALIDATION_ERROR");
    const { data: app } = await db.from("connected_apps").select("id,is_active").eq("id", appId).eq("is_active", true).maybeSingle();
    if (!app) return fail("This website is not available for connection.", 404, "APP_NOT_AVAILABLE");
    const { data, error } = await db.from("user_connected_apps").upsert({ user_id: user.id, app_id: app.id, disconnected_at: null, revoked_at: null, updated_at: new Date().toISOString() }, { onConflict: "user_id,app_id" }).select("id,app_id,scopes,connected_at,disconnected_at,revoked_at").single();
    if (error) return fail(error.message, 400, "APP_CONNECT_FAILED");
    return ok({ connection: data });
  } catch (error) {
    console.error("[CONNECTED_APPS_POST_ERROR]", error);
    return fail("Internal server error", 500, "INTERNAL_ERROR");
  }
}
