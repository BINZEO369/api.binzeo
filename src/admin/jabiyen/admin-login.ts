// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import express from "express";
import { adminAuth, createJabiyenAuthClient, getJabiyenAdmin } from "./admin-context";
import { supabase } from "./admin-context";

const router = express.Router();

router.post("/api/admin/login", async (req, res) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length > 72) {
    return res.status(422).json({ success: false, error: "Enter a valid admin email and password" });
  }

  try {
    const authClient = createJabiyenAuthClient();
    const { data, error } = await authClient.auth.signInWithPassword({ email, password });
    if (error || !data?.user || !data?.session) {
      return res.status(401).json({ success: false, error: "Invalid admin email or password" });
    }

    const { data: admin, error: adminError } = await getJabiyenAdmin(data.user.id);
    if (adminError) {
      return res.status(503).json({ success: false, error: "Could not verify JABIYEN admin access" });
    }
    if (!admin || admin.is_active !== true) {
      return res.status(403).json({ success: false, error: "This account does not have active JABIYEN admin access" });
    }

    await supabase.from("admins").update({ last_login: new Date().toISOString() }).eq("id", admin.id);
    return res.json({
      success: true,
      data: {
        session: data.session,
        user: { id: data.user.id, email: data.user.email },
        admin: { id: admin.id, email: admin.email, full_name: admin.full_name, role: admin.role },
      },
    });
  } catch {
    return res.status(500).json({ success: false, error: "JABIYEN admin sign-in could not be completed" });
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
