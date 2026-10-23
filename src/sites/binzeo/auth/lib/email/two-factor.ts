import { EMAIL_FROM, getPublicSiteUrl, transporter } from "@/sites/binzeo/auth/lib/email/transporter";
import { emailButton, emailCodeBlock, escapeEmailText, renderEmailLayout, type EmailSecurityContext } from "@/sites/binzeo/auth/lib/email/layout";
import { getSupabaseAdmin } from "@/sites/binzeo/auth/lib/supabase/admin";

export function buildTwoFactorLoginEmail(code: string, expiresInSeconds: number, siteUrl: string, context?: EmailSecurityContext) {
  return {
    subject: "BINZEO 2FA — Your login verification code",
    html: renderEmailLayout({
      siteUrl,
      eyebrow: "Two-factor authentication",
      title: "Confirm your sign-in",
      description: "Use this one-time code to finish signing in to your BINZEO account.",
      context,
      body: emailCodeBlock("2FA verification code", code, expiresInSeconds) + `<p style="margin:18px 0 0;color:#ffffff;font-size:12px;line-height:1.6;text-align:center;">If you did not try to sign in, change your password and review your security activity.</p>`,
      footerNote: "This code was requested as part of your BINZEO two-factor authentication.",
    }),
  };
}

export function buildLoginNotificationEmail(loginMethod: string, siteUrl: string, context?: EmailSecurityContext) {
  const safeLoginMethod = escapeEmailText(loginMethod);
  return {
    subject: "BINZEO Security Alert — New sign-in detected",
    html: renderEmailLayout({
      siteUrl,
      eyebrow: "Security notification",
      title: "New sign-in detected",
      description: `Your BINZEO account was accessed using <strong style="color:#ffffff;">${safeLoginMethod}</strong>.`,
      context,
      body: emailButton("Review security activity", `${siteUrl.replace(/\/+$/, "")}/dashboard/security`) + `<p style="margin:22px 0 0;color:#ffffff;font-size:12px;line-height:1.6;text-align:center;">If this was not you, secure your account immediately.</p>`,
      footerNote: "You received this message because two-factor authentication is enabled on your account.",
    }),
  };
}

export async function sendLoginNotification({ userId, email, loginMethod, ipAddress, userAgent, siteUrl, context }: { userId: string; email: string; loginMethod: string; ipAddress: string | null; userAgent: string | null; siteUrl: string; context?: EmailSecurityContext }) {
  const admin = getSupabaseAdmin();
  const { data: event, error } = await admin.from("two_factor_authentication_events").insert({
    user_id: userId,
    email,
    event_type: "login_notification",
    login_method: loginMethod,
    status: "pending",
    ip_address: ipAddress,
    user_agent: userAgent,
  }).select("id").single();
  if (error || !event) throw error ?? new Error("Login notification event could not be created");
  try {
    const content = buildLoginNotificationEmail(loginMethod, siteUrl, context);
    const info = await transporter.sendMail({ from: EMAIL_FROM, to: email, subject: content.subject, html: content.html });
    await admin.from("two_factor_authentication_events").update({ status: "sent", sent_at: new Date().toISOString(), provider_message_id: info.messageId ?? null }).eq("id", event.id);
    return { eventId: event.id, sent: true };
  } catch (error) {
    await admin.from("two_factor_authentication_events").update({ status: "failed", metadata: { error: error instanceof Error ? error.message : "notification_failed" } }).eq("id", event.id);
    throw error;
  }
}

export function publicSiteUrl(headers?: { get(name: string): string | null }) {
  return getPublicSiteUrl(headers);
}
