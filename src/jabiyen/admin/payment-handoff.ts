import "server-only";
import express from "express";
import { z } from "zod";
import { PaymentServiceError, redeemPaymentReturnHandoff } from "@/binzeo/payments/service";
import { createPrivilegedClient } from "@/common/database/supabase/clients";
import { consumeRateLimit } from "@/common/security/rate-limit";

const router = express.Router();
const bodySchema = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();
router.post("/api/payment-handoff", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");

  const rateHeaders = new Headers();
  const trustedIp = req.get("x-real-ip") || req.ip;
  if (trustedIp) rateHeaders.set("x-real-ip", trustedIp);
  const rateRequest = new Request("https://api.binzeo.invalid/jabiyen-payment-handoff", { headers: rateHeaders });
  const rateLimit = await consumeRateLimit(createPrivilegedClient(), rateRequest, "jabi-payment-handoff", 30, 60);
  if (!rateLimit.allowed) {
    if ("unavailable" in rateLimit) return res.status(503).json({ success: false, code: "RATE_LIMIT_UNAVAILABLE", error: "Order return protection is temporarily unavailable." });
    res.setHeader("Retry-After", String(rateLimit.retryAfterSeconds));
    return res.status(429).json({ success: false, code: "RATE_LIMITED", error: "Too many order return requests. Try again later." });
  }

  const requestOrigin = req.get("origin") || "";
  if (process.env.NODE_ENV !== "production" && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(requestOrigin)) {
    // Local development only; production destinations must come from the central registry.
  } else {
    try {
      const centralDb = createPrivilegedClient();
      const { data: project, error: projectError } = await centralDb.from("platform_projects")
        .select("id,allowed_origins")
        .eq("project_key", "jabiyen")
        .eq("status", "active")
        .maybeSingle();
      if (projectError) throw projectError;
      const { data: site, error: siteError } = project
        ? await centralDb.from("payment_site_settings").select("order_return_origin,enabled").eq("project_id", project.id).maybeSingle()
        : { data: null, error: null };
      if (siteError) throw siteError;
      const allowlist = Array.isArray(project?.allowed_origins) ? project.allowed_origins : [];
      if (!requestOrigin || !site?.enabled || site.order_return_origin !== requestOrigin || !allowlist.includes(requestOrigin)) {
        return res.status(403).json({ success: false, code: "PAYMENT_HANDOFF_ORIGIN_NOT_ALLOWED", error: "The order return origin is not allowed." });
      }
    } catch (error) {
      console.error("[JABIYEN_PAYMENT_HANDOFF_ORIGIN_CHECK]", error && typeof error === "object" && "code" in error ? String(error.code) : "CONFIG_ERROR");
      return res.status(503).json({ success: false, code: "PAYMENT_HANDOFF_UNAVAILABLE", error: "Order return protection is temporarily unavailable." });
    }
  }

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(404).json({ success: false, code: "PAYMENT_HANDOFF_INVALID", error: "This order return link has expired or was already used." });

  try {
    const result = await redeemPaymentReturnHandoff(parsed.data.token);
    return res.status(200).json({ success: true, order: result.order });
  } catch (error) {
    if (error instanceof PaymentServiceError) {
      return res.status(error.status).json({ success: false, code: error.code, error: error.message });
    }
    console.error("[JABIYEN_PAYMENT_HANDOFF_REDEEM]", error instanceof Error ? error.name : "UNKNOWN");
    return res.status(503).json({ success: false, code: "PAYMENT_HANDOFF_UNAVAILABLE", error: "The confirmed order could not be loaded yet." });
  }
});

export default router;
