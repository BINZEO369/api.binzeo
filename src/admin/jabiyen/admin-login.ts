// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import express from "express";
import { adminAuth, createJabiyenAuthClient, getJabiyenAdmin } from "./admin-context";

const router = express.Router();

router.post("/api/admin/login", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!email || !password) return res.status(422).json({ success: false, error: "Admin email and password are required" });
    const authClient = createJabiyenAuthClient();
    const { data, error } = await authClient.auth.signInWithPassword({ email, password });
    if (error || !data.user || !data.session) return res.status(401).json({ success: false, error: "Invalid admin email or password" });
    const { data: admin, error: adminError } = await getJabiyenAdmin(data.user.id);
    if (adminError) return res.status(503).json({ success: false, error: "Could not verify JABIYEN admin access" });
    if (!admin || admin.is_active !== true) return res.status(403).json({ success: false, error: "Active JABIYEN admin access required" });
    return res.json({ success: true, data: { session: data.session, user: data.user, admin } });
  } catch (error) {
    return res.status(500).json({ success: false, error: error?.message || "Admin login failed" });
  }
});

router.get("/api/admin/session", adminAuth, (req, res) => {
  res.json({
    success: true,
    data: {
      user: { id: req.user.id, email: req.user.email },
      admin: { id: req.admin.id, email: req.admin.email, full_name: req.admin.full_name, role: req.admin.role },
    },
  });
});

export default router;
