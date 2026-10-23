// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { createClient } from "@supabase/supabase-js";

function getJabiyenSupabaseConfig() {
  const url = process.env.JABIYEN_SUPABASE_URL;
  const serviceRoleKey = process.env.JABIYEN_SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.JABIYEN_SUPABASE_ANON_KEY;
  if (!url || !serviceRoleKey || !anonKey) {
    throw new Error("JABIYEN database environment is not configured");
  }
  return { url, serviceRoleKey, anonKey };
}

let serviceClient;
function getServiceClient() {
  if (!serviceClient) {
    const { url, serviceRoleKey } = getJabiyenSupabaseConfig();
    serviceClient = createClient(url, serviceRoleKey);
  }
  return serviceClient;
}

// Keep secrets out of build-time module evaluation. Actual database access still
// requires all three environment variables and fails closed when they are absent.
export const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  get(_target, property) {
    if (property === "then") return undefined;
    if (typeof property === "symbol") return undefined;
    const client = getServiceClient();
    const value = client[property];
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export function createJabiyenAuthClient() {
  const { url, anonKey } = getJabiyenSupabaseConfig();
  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export async function getJabiyenAdmin(userId) {
  return supabase
    .from("admins")
    .select("id,user_id,email,full_name,role,is_active")
    .eq("user_id", userId)
    .maybeSingle();
}

export async function adminAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ success: false, error: "JABIYEN admin session required" });

    const authClient = createJabiyenAuthClient();
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ success: false, error: "Invalid JABIYEN admin session" });

    const { data: admin, error: adminError } = await getJabiyenAdmin(user.id);
    if (adminError) return res.status(503).json({ success: false, error: "Could not verify JABIYEN admin access" });
    if (!admin || admin.is_active !== true) {
      return res.status(403).json({ success: false, error: "Active JABIYEN admin access required" });
    }

    req.user = user;
    req.admin = admin;
    next();
  } catch {
    return res.status(500).json({ success: false, error: "Could not verify JABIYEN admin session" });
  }
}

export async function superAdminAuth(req, res, next) {
  await adminAuth(req, res, () => {
    if (req.admin?.role !== "super_admin") {
      return res.status(403).json({ success: false, error: "JABIYEN super admin access required" });
    }
    next();
  });
}
