/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/modules/identity/lib/supabase/admin";
import { getAdminServiceContext } from "@/modules/admin/lib/admin";
import { fail, ok } from "@/modules/identity/lib/api/response";
import { parseContentBlocks, renderEmailTemplateHtml } from "@/modules/identity/lib/email/template-renderer";
import { EMAIL_FROM, getPublicSiteUrl, transporter } from "@/modules/identity/lib/email/transporter";
import { getAuthEmailMap } from "@/modules/identity/lib/admin-email-audience";

type OccasionTemplate = {
  id: string;
  name: string;
  template_type: string;
  theme: string;
  subject: string;
  preview_text: string;
  headline: string;
  message: string;
  button_label: string | null;
  button_url: string | null;
  buttons: unknown;
  images: unknown;
  content_blocks: unknown;
};
type OccasionProfile = { id: string; display_name: string | null; marketing_email: boolean; account_status: string; date_of_birth: string | null; country_code: string | null; preferred_language: string | null; created_at: string | null };

const templateFields = "id,name,template_type,theme,subject,preview_text,headline,message,button_label,button_url,buttons,images,content_blocks";

async function getAuthEmails(admin: ReturnType<typeof getSupabaseAdmin>, profiles: OccasionProfile[]) {
  const emails = await getAuthEmailMap(admin, profiles.map((profile) => profile.id));
  return profiles.flatMap((profile) => {
    const email = emails.get(profile.id);
    return email ? [{ profile, email }] : [];
  });
}

export async function GET(request: NextRequest) {
  const context = await getAdminServiceContext(request, "marketing.send");
  if (!context) return fail("Occasion email permission required", 403, "OCCASION_EMAIL_FORBIDDEN");
  try {
    const [{ data: templateRows, error: templateError }, { data: profileRows, error: profileError }, { data: deliveryRows, error: deliveryError }] = await Promise.all([
      (context.admin.from("email_templates") as any).select(templateFields).eq("template_type", "occasion").eq("is_active", true).order("updated_at", { ascending: false }).limit(100),
      (context.admin.from("profiles") as any).select("id,display_name,marketing_email,account_status,date_of_birth,country_code,preferred_language,created_at").eq("account_status", "active").eq("marketing_email", true).order("display_name").limit(1000),
      (context.admin.from("occasion_email_deliveries") as any).select("id,user_id,template_id,template_name,template_type,subject,recipient_email,recipient_name,status,error_message,sent_at,created_at").order("created_at", { ascending: false }).limit(500),
    ]);
    if (templateError) return fail(templateError.message, 500, "OCCASION_TEMPLATES_LOAD_FAILED");
    if (profileError) return fail(profileError.message, 500, "OCCASION_USERS_LOAD_FAILED");
    if (deliveryError) return fail(deliveryError.message, 500, "OCCASION_HISTORY_LOAD_FAILED");
    const eligibleProfiles = (profileRows ?? []) as OccasionProfile[];
    const authUsers = await getAuthEmails(context.admin, eligibleProfiles);
    const users = authUsers.map(({ profile, email }) => ({ id: profile.id, email, display_name: profile.display_name, date_of_birth: profile.date_of_birth, country_code: profile.country_code, preferred_language: profile.preferred_language, created_at: profile.created_at }));
    return ok({ templates: templateRows ?? [], users, deliveries: deliveryRows ?? [], eligible_user_count: users.length, audience_truncated: (profileRows ?? []).length >= 1000 });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Could not load occasion mail data", 500, "OCCASION_MAIL_LOAD_FAILED");
  }
}

export async function POST(request: NextRequest) {
  const context = await getAdminServiceContext(request, "marketing.send");
  if (!context) return fail("Occasion email permission required", 403, "OCCASION_EMAIL_FORBIDDEN");
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const userId = typeof body.user_id === "string" ? body.user_id : "";
  const templateId = typeof body.template_id === "string" ? body.template_id : "";
  if (!userId || !templateId) return fail("Choose one eligible user and one saved occasion template", 422, "OCCASION_SEND_SELECTION_REQUIRED");

  const { data: templateRow, error: templateError } = await (context.admin.from("email_templates") as any)
    .select(templateFields).eq("id", templateId).eq("template_type", "occasion").eq("is_active", true).maybeSingle();
  if (templateError) return fail(templateError.message, 500, "OCCASION_TEMPLATE_LOAD_FAILED");
  if (!templateRow) return fail("That saved occasion template is unavailable", 404, "OCCASION_TEMPLATE_NOT_FOUND");
  const template = templateRow as OccasionTemplate;
  const safeSubject = (template.subject ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, 180);
  if (!safeSubject) return fail("The occasion template subject is empty", 422, "OCCASION_SUBJECT_EMPTY");
  const contentBlocks = parseContentBlocks(template.content_blocks).blocks;
  const hasBlockContent = contentBlocks.length > 0;
  const hasBlockHeadline = contentBlocks.some((block) => block.type === "headline" && block.text.trim());
  const hasBlockMessage = contentBlocks.some((block) => block.type === "message" && block.text.trim());
  if (!template.subject?.trim() || (hasBlockContent ? !hasBlockHeadline || !hasBlockMessage : !template.headline?.trim() || !template.message?.trim())) {
    return fail("Complete and save the subject, headline and email message before sending", 422, "OCCASION_TEMPLATE_INCOMPLETE");
  }

  const { data: profileRow, error: profileError } = await (context.admin.from("profiles") as any)
    .select("id,display_name,marketing_email,account_status").eq("id", userId).eq("account_status", "active").eq("marketing_email", true).maybeSingle();
  if (profileError) return fail(profileError.message, 500, "OCCASION_USER_LOAD_FAILED");
  if (!profileRow) return fail("The user is not active or has not enabled marketing email consent", 403, "OCCASION_USER_NOT_ELIGIBLE");
  const { data: authUser, error: authError } = await context.admin.auth.admin.getUserById(userId);
  if (authError || !authUser.user?.email) return fail("The selected user has no deliverable email address", 422, "OCCASION_USER_EMAIL_MISSING");

  const recipientEmail = authUser.user.email;
  const recipientName = typeof profileRow.display_name === "string" ? profileRow.display_name : null;
  const deliveries = context.admin.from("occasion_email_deliveries") as any;
  const { data: inProgress, error: progressError } = await deliveries.select("id,created_at").eq("user_id", userId).eq("template_id", template.id).eq("status", "sending").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (progressError) return fail(progressError.message, 500, "OCCASION_PROGRESS_CHECK_FAILED");
  if (inProgress) {
    const ageMs = Date.now() - new Date(inProgress.created_at).getTime();
    if (Number.isFinite(ageMs) && ageMs < 15 * 60 * 1000) return fail("A delivery attempt is still being processed. Check the history and retry later.", 409, "OCCASION_SEND_IN_PROGRESS");
    const { error: staleError } = await deliveries.update({ status: "failed", error_message: "The previous attempt did not record a final result; delivery outcome is unknown. Confirm delivery before retrying." }).eq("id", inProgress.id);
    if (staleError) return fail(staleError.message, 500, "OCCASION_STALE_ATTEMPT_UPDATE_FAILED");
  }
  const { data: delivery, error: logError } = await (context.admin.from("occasion_email_deliveries") as any)
    .insert({ user_id: userId, template_id: template.id, template_name: template.name, template_type: "occasion", subject: safeSubject, recipient_email: recipientEmail, recipient_name: recipientName, consent_snapshot: true, sent_by: context.user.id, status: "sending" })
    .select("id,created_at").single();
  if (logError?.code === "23505") return fail("A send for this user and template is already in progress", 409, "OCCASION_SEND_IN_PROGRESS");
  if (logError || !delivery) return fail(logError?.message ?? "Delivery log could not be created", 500, "OCCASION_LOG_CREATE_FAILED");

  try {
    const siteUrl = getPublicSiteUrl(request.headers);
    const html = renderEmailTemplateHtml({ ...template, content_blocks: contentBlocks }, siteUrl, recipientName ?? "there");
    const info = await transporter.sendMail({ from: EMAIL_FROM, to: recipientEmail, subject: safeSubject, html });
    const sentAt = new Date().toISOString();
    const { error: updateError } = await (context.admin.from("occasion_email_deliveries") as any)
      .update({ status: "sent", sent_at: sentAt, provider_message_id: info.messageId ?? null })
      .eq("id", delivery.id);
    if (updateError) return fail("The email was sent, but its delivery status could not be finalized. Check the occasion email history before retrying.", 500, "OCCASION_LOG_FINALIZE_FAILED");
    return ok({ sent: true, delivery_id: delivery.id, user_id: userId, template_id: template.id, sent_at: sentAt });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message.slice(0, 1000) : "SMTP delivery failed";
    await (context.admin.from("occasion_email_deliveries") as any).update({ status: "failed", error_message: errorMessage }).eq("id", delivery.id);
    return fail(errorMessage, 502, "OCCASION_SMTP_SEND_FAILED");
  }
}
