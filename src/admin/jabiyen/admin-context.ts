// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.JABIYEN_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.JABIYEN_SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.JABIYEN_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !SUPABASE_ANON_KEY) {
  throw new Error("JABIYEN database environment is not configured");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

export function createJabiyenAuthClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
