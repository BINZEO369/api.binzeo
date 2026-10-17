// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.JABIYEN_SUPABASE_URL;
const SUPABASE_KEY = process.env.JABIYEN_SUPABASE_SERVICE_ROLE_KEY;
const CENTRAL_AUTH_URL = process.env.AUTH_SUPABASE_URL;
const CENTRAL_AUTH_KEY = process.env.AUTH_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY || !CENTRAL_AUTH_URL || !CENTRAL_AUTH_KEY) throw new Error("JABIYEN/Central Auth environment is not configured");
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const centralAuth = createClient(CENTRAL_AUTH_URL, CENTRAL_AUTH_KEY);

export async function adminAuth(req, res, next) {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).json({ success: false, error: "Central access token required" });
    const { data: { user }, error: authError } = await centralAuth.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ success: false, error: "Invalid Central access token" });
    const userClient = createClient(CENTRAL_AUTH_URL, CENTRAL_AUTH_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: access, error: accessError } = await userClient.from("admin_access").select("roles,permissions,is_active").eq("user_id", user.id).maybeSingle();
    if (accessError || !access?.is_active) return res.status(403).json({ success: false, error: "Central admin access required" });
    req.user = user;
    req.admin = { ...access, role: Array.isArray(access.roles) && access.roles.includes("super_admin") ? "super_admin" : "admin" };
    next();
  } catch (err) { return res.status(500).json({ success: false, error: err.message }); }
}
export async function superAdminAuth(req, res, next) {
  await adminAuth(req, res, () => {
    if (req.admin?.role !== "super_admin") return res.status(403).json({ success: false, error: "Central super admin access required" });
    next();
  });
}
