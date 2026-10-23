import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/sites/binzeo/auth/lib/supabase/admin";
import { buildBirthdayEmail } from "@/sites/binzeo/auth/lib/email/birthday";
import { EMAIL_FROM, getPublicSiteUrl, transporter } from "@/sites/binzeo/auth/lib/email/transporter";

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization") ?? "";
  if (secret) return authorization === `Bearer ${secret}`;
  return request.headers.get("x-vercel-cron") === "1";
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const admin = getSupabaseAdmin();
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  const siteUrl = getPublicSiteUrl(request.headers);
  const { data: profiles, error: profileError } = await admin.from("profiles").select("id,display_name,date_of_birth").eq("account_status", "active").eq("marketing_email", true).not("date_of_birth", "is", null).limit(1000);
  if (profileError) return Response.json({ error: profileError.message }, { status: 500 });
  const birthdays = (profiles ?? []).filter((profile) => typeof profile.date_of_birth === "string" && profile.date_of_birth.slice(5, 7) === month && profile.date_of_birth.slice(8, 10) === day);
  if (!birthdays.length) return Response.json({ date: `${year}-${month}-${day}`, matched: 0, sent: 0, failed: 0, skipped: 0 });

  const { data: savedBirthdayTemplate } = await admin.from("email_templates").select("subject,preview_text,headline,message,button_label,button_url,buttons,theme,images").eq("template_type", "birthday").eq("is_active", true).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const template = savedBirthdayTemplate ?? undefined;
  const campaignPreview = buildBirthdayEmail({ siteUrl, name: birthdays[0].display_name, buttonUrl: template?.button_url ?? `${siteUrl}/dashboard/profile`, template });
  const { data: campaign, error: campaignError } = await admin.from("marketing_email_campaigns").insert({ subject: campaignPreview.subject, preview_text: template?.preview_text ?? "A special birthday wish from BINZEO.", html_body: campaignPreview.html, created_by: birthdays[0].id, status: "sending", recipient_count: birthdays.length, started_at: now.toISOString(), template_type: "birthday", birthday_year: year, target_user_ids: birthdays.map((profile) => profile.id), theme: template?.theme ?? "dark" }).select("id").single();
  if (campaignError || !campaign) return Response.json({ error: campaignError?.message ?? "Birthday campaign could not be created" }, { status: 500 });

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const profile of birthdays) {
    const authUser = await admin.auth.admin.getUserById(profile.id);
    const email = authUser.data.user?.email;
    if (!email) { skipped += 1; continue; }
    const { data: claim, error: claimError } = await admin.from("birthday_email_deliveries").insert({ user_id: profile.id, birthday_year: year, email, campaign_id: campaign.id, status: "sending" }).select("id").single();
    if (claimError?.code === "23505") { skipped += 1; continue; }
    if (claimError || !claim) { failed += 1; continue; }
    const delivery = await admin.from("marketing_email_deliveries").insert({ campaign_id: campaign.id, user_id: profile.id, email, consent_snapshot: true, status: "pending" }).select("id").single();
    try {
      const emailContent = buildBirthdayEmail({ siteUrl, name: profile.display_name, buttonUrl: template?.button_url ?? `${siteUrl}/dashboard/profile`, template });
      const info = await transporter.sendMail({ from: EMAIL_FROM, to: email, subject: emailContent.subject, html: emailContent.html });
      sent += 1;
      await admin.from("birthday_email_deliveries").update({ status: "sent", provider_message_id: info.messageId ?? null, sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", claim.id);
      if (delivery.data?.id) await admin.from("marketing_email_deliveries").update({ status: "sent", provider_message_id: info.messageId ?? null, sent_at: new Date().toISOString() }).eq("id", delivery.data.id);
      await admin.from("user_birthdays").update({ last_birthday_wish_year: year, last_birthday_wish_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("user_id", profile.id);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "Birthday email failed";
      await admin.from("birthday_email_deliveries").update({ status: "failed", error_message: message, updated_at: new Date().toISOString() }).eq("id", claim.id);
      if (delivery.data?.id) await admin.from("marketing_email_deliveries").update({ status: "failed", error_message: message }).eq("id", delivery.data.id);
    }
  }
  await admin.from("marketing_email_campaigns").update({ status: failed ? (sent ? "partial" : "failed") : "sent", sent_count: sent, failed_count: failed, skipped_count: skipped, completed_at: new Date().toISOString() }).eq("id", campaign.id);
  return Response.json({ date: `${year}-${month}-${day}`, campaign_id: campaign.id, matched: birthdays.length, sent, failed, skipped });
}
