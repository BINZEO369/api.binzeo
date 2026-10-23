// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import express from "express";
import { adminAuth } from "./admin-context";

const router = express.Router();

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
