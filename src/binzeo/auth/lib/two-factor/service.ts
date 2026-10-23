import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { EMAIL_FROM, transporter } from "@/binzeo/auth/lib/email/transporter";
import { buildTwoFactorLoginEmail } from "@/binzeo/auth/lib/email/two-factor";
import { getPublicSiteUrl } from "@/binzeo/auth/lib/email/transporter";
import { getSupabaseAdmin } from "@/binzeo/auth/lib/supabase/admin";
import type { EmailSecurityContext } from "@/binzeo/auth/lib/email/layout";

export async function isTwoFactorEnabled(userId: string) {
  const admin = getSupabaseAdmin();
  const { data } = await admin.from("user_two_factor_settings").select("enabled").eq("user_id", userId).maybeSingle();
  return data?.enabled === true;
}

function requestIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? null;
}

export async function issueAndSendTwoFactorCode({ admin, req, userId, email, loginMethod, context }: { admin: SupabaseClient; req: NextRequest; userId: string; email: string; loginMethod: string; context?: EmailSecurityContext }) {
  const { data: raw, error } = await admin.rpc("issue_two_factor_login_code", {
    target_user_id: userId,
    target_email: email,
    target_login_method: loginMethod,
    request_ip: requestIp(req),
  });
  const challenge = Array.isArray(raw) ? raw[0] : raw;
  if (error || !challenge?.challenge_id || !challenge?.verification_code) throw error ?? new Error("2FA challenge could not be issued");
  try {
    const content = buildTwoFactorLoginEmail(String(challenge.verification_code), 30, getPublicSiteUrl(req.headers), context);
    await transporter.sendMail({ from: EMAIL_FROM, to: email, subject: content.subject, html: content.html });
    await admin.from("two_factor_challenges").update({ email_delivery_status: "sent", email_sent_at: new Date().toISOString() }).eq("id", challenge.challenge_id);
    await admin.from("two_factor_authentication_events").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", challenge.event_id);
  } catch (mailError) {
    const message = mailError instanceof Error ? mailError.message : "2FA email failed";
    await admin.from("two_factor_challenges").update({ email_delivery_status: "failed", email_error: message }).eq("id", challenge.challenge_id);
    await admin.from("two_factor_authentication_events").update({ status: "failed", metadata: { error: message } }).eq("id", challenge.event_id);
    throw mailError;
  }
  return { challengeId: String(challenge.challenge_id) };
}
