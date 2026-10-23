/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/sites/binzeo/auth/lib/supabase/admin";
import { getAdminServiceContext } from "@/sites/binzeo/admin/lib/admin";
import { ok, fail } from "@/sites/binzeo/auth/lib/api/response";
import { EMAIL_FROM, getPublicSiteUrl, transporter } from "@/sites/binzeo/auth/lib/email/transporter";
import { renderEmailLayout } from "@/sites/binzeo/auth/lib/email/layout";
import { getAuthEmailMap } from "@/sites/binzeo/auth/lib/admin-email-audience";

function escape(value: string) { return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char)); }
async function prepareInlineImage(imageUrl: string, cid: string, filename: string) {
  const response = await fetch(imageUrl, { cache: "no-store", redirect: "follow" });
  const contentType = response.headers.get("content-type")?.split(";")[0] ?? "";
  if (!response.ok || !contentType.startsWith("image/")) throw new Error("The image URL could not be fetched as an image.");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) throw new Error("Each email image must be between 1 byte and 5 MB.");
  return { html: (html: string) => html.replaceAll(escape(imageUrl), `cid:${cid}`), attachment: { filename, content: buffer, cid, contentType } };
}
type MarketingImage = { url: string; position: string };
type MarketingButton = { label: string; url: string };
type MarketingTheme = "dark" | "light";
type MarketingTemplate = "custom" | "birthday";
type EligibleRecipient = { user_id: string; email: string; display_name: string | null; date_of_birth: string | null; country_code: string | null; preferred_language: string | null; created_at: string | null };
const positions = ["top", "after_headline", "after_message", "before_button"];
const themes: MarketingTheme[] = ["dark", "light"];
function buildEmail(input: { siteUrl: string; template: MarketingTemplate; preheader: string; headline: string; message: string; recipient_name?: string; button_label?: string; button_url?: string; images?: MarketingImage[]; buttons?: MarketingButton[]; unsubscribe_url: string; theme: MarketingTheme }) {
  const ink = input.theme === "light" ? "#000000" : "#ffffff";
  const name = input.recipient_name?.trim() || "there";
  const isBirthday = input.template === "birthday";
  const buttonItems = input.buttons?.length ? input.buttons : (input.button_label && input.button_url ? [{ label: input.button_label, url: input.button_url }] : []);
  const button = buttonItems.map((item) => `<div style="padding:0 0 12px;text-align:left;"><a href="${escape(item.url)}" style="color:${ink};font-size:14px;font-weight:700;text-decoration:underline;text-underline-offset:4px;">${escape(item.label)} →</a></div>`).join("");
  const renderImages = (position: string) => (input.images ?? []).filter((image) => image.position === position).map((image) => `<p style="margin:24px 0;text-align:center"><img src="${escape(image.url)}" alt="" style="display:block;width:100%;max-width:560px;height:auto;border:0;margin:0 auto" /></p>`).join("");
  const leadImage = renderImages("top") + renderImages("after_headline");
  const birthdayMessage = `Wishing you a wonderful birthday, ${name}! May your new year be filled with meaningful connections, fresh opportunities, and beautiful moments.`;
  const message = (isBirthday && !input.message.trim() ? birthdayMessage : input.message).replaceAll("{{name}}", name).replaceAll("[Name]", name);
  const body = `<p style="margin:0 0 22px;color:${ink};font-size:16px;line-height:1.5;font-weight:700;">Hey ${escape(name)},</p>${leadImage}<div style="color:${ink};font-size:14px;line-height:1.7;white-space:pre-wrap">${escape(message).replace(/\n/g, "<br>")}</div>${renderImages("after_message")}${renderImages("before_button")}${button}`;
  return renderEmailLayout({ siteUrl: input.siteUrl, eyebrow: isBirthday ? "BINZEO · BIRTHDAY" : "BINZEO · NEWS", title: escape(input.headline), description: escape(input.preheader), body, showSecurityDetails: false, theme: input.theme, footerNote: `You are receiving this email because you allowed Marketing emails in your BINZEO notification preferences. <a href="${escape(input.unsubscribe_url)}" style="color:${ink};text-decoration:underline;">Unsubscribe from marketing emails</a>` });
}
async function getRecipients(admin: ReturnType<typeof getSupabaseAdmin>, teamIds: string[] = [], selectedUserIds: string[] = []): Promise<EligibleRecipient[]> {
  let userIds: string[] | null = null;
  if (selectedUserIds.length) {
    userIds = [...new Set(selectedUserIds)].slice(0, 500);
  } else if (teamIds.length) {
    const { data: memberships, error } = await (admin.from("user_sector_access") as any).select("user_id").in("sector_id", teamIds).eq("status", "active").limit(5000);
    if (error) throw error;
    const ids = [...new Set((memberships ?? []).map((row: { user_id: string }) => row.user_id))] as string[];
    userIds = ids;
    if (!ids.length) return [];
  }
  let query = (admin.from("profiles") as any).select("id,display_name,date_of_birth,country_code,preferred_language,created_at").eq("marketing_email", true).eq("account_status", "active").limit(1000);
  if (userIds) query = query.in("id", userIds);
  const { data: profiles, error } = await query;
  if (error) throw error;
  const profileRows = profiles ?? [];
  const emails = await getAuthEmailMap(admin, profileRows.map((profile: { id: string }) => profile.id));
  return profileRows.flatMap((profile: { id: string; display_name: string | null; date_of_birth: string | null; country_code: string | null; preferred_language: string | null; created_at: string | null }) => {
    const email = emails.get(profile.id);
    return email ? [{ user_id: profile.id, email, display_name: profile.display_name, date_of_birth: profile.date_of_birth ?? null, country_code: profile.country_code ?? null, preferred_language: profile.preferred_language ?? null, created_at: profile.created_at ?? null }] : [];
  });
}
export async function GET(request: NextRequest) {
  const context = await getAdminServiceContext(request, "marketing.send");
  if (!context) return fail("Marketing email permission required", 403, "MARKETING_SEND_REQUIRED");
  try {
    const [{ data: teams }] = await Promise.all([
      (context.admin.from("sectors") as any).select("id,sector_code,sector_name").eq("is_active", true).order("sector_name").limit(100),
    ]);
    const recipients = await getRecipients(context.admin);
    return ok({ recipient_count: recipients.length, audience_truncated: recipients.length >= 1000, users: recipients.map(({ user_id, email, display_name, date_of_birth, country_code, preferred_language, created_at }) => ({ id: user_id, email, display_name, date_of_birth, country_code, preferred_language, created_at })), teams: teams ?? [], smtp_source: "auth.binzeo" });
  } catch (error) { return fail(error instanceof Error ? error.message : "Could not load marketing settings", 500, "MARKETING_SETTINGS_FAILED"); }
}
export async function POST(request: NextRequest) {
  const context = await getAdminServiceContext(request, "marketing.send");
  if (!context) return fail("Marketing email permission required", 403, "MARKETING_SEND_REQUIRED");
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const subject = typeof body.subject === "string" ? body.subject.trim().slice(0, 180) : "";
  const preheader = typeof body.preheader === "string" ? body.preheader.trim().slice(0, 240) : "";
  const headline = typeof body.headline === "string" ? body.headline.trim().slice(0, 180) : "";
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 10000) : "";
  const button_label = typeof body.button_label === "string" ? body.button_label.trim().slice(0, 80) : "";
  const button_url = typeof body.button_url === "string" ? body.button_url.trim().slice(0, 500) : "";
  const template: MarketingTemplate = body.template === "birthday" ? "birthday" : "custom";
  const templateId = typeof body.template_id === "string" ? body.template_id : "";
  const theme = themes.includes(body.theme as MarketingTheme) ? body.theme as MarketingTheme : "dark";
  const teamIds = Array.isArray(body.team_ids) ? body.team_ids.filter((id): id is string => typeof id === "string").slice(0, 50) : [];
  const selectedUserIds = Array.isArray(body.selected_user_ids) ? body.selected_user_ids.filter((id): id is string => typeof id === "string").slice(0, 500) : [];
  const images: MarketingImage[] = Array.isArray(body.images) ? body.images.slice(0, 8).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    const url = typeof candidate.url === "string" && /^https:\/\//i.test(candidate.url) ? candidate.url.trim().slice(0, 1000) : "";
    const position = positions.includes(String(candidate.position)) ? String(candidate.position) : "after_message";
    return url ? [{ url, position }] : [];
  }) : [];
  if (!images.length && typeof body.image_url === "string" && /^https:\/\//i.test(body.image_url)) images.push({ url: body.image_url.trim().slice(0, 1000), position: "after_headline" });
  const siteUrl = getPublicSiteUrl(request.headers);
  const birthdayYear = new Date().getUTCFullYear();
  const unsubscribe_url = `${siteUrl}/dashboard/profile#notifications`;
  const { data: selectedSavedTemplate } = templateId
    ? await (context.admin.from("email_templates") as any).select("id,template_type,subject,preview_text,headline,message,button_label,button_url,buttons,theme,images").eq("id", templateId).eq("is_active", true).maybeSingle()
    : template === "birthday"
      ? await (context.admin.from("email_templates") as any).select("id,template_type,subject,preview_text,headline,message,button_label,button_url,buttons,theme,images").eq("template_type", "birthday").eq("is_active", true).order("updated_at", { ascending: false }).limit(1).maybeSingle()
      : { data: null };
  const savedTemplate = selectedSavedTemplate ?? {};
  if (savedTemplate.template_type === "occasion") return fail("Use the Occasion email sender for festival and occasion templates", 422, "OCCASION_TEMPLATE_REQUIRES_SEPARATE_SENDER");
  const finalSubject = savedTemplate.subject || (template === "birthday" ? "Happy Birthday from BINZEO" : subject);
  const finalPreheader = savedTemplate.preview_text || (template === "birthday" ? "A special birthday wish from BINZEO." : preheader);
  const finalHeadline = savedTemplate.headline || (template === "birthday" ? "Happy Birthday" : headline);
  const finalMessage = savedTemplate.message || (template === "birthday" ? "" : message);
  const finalButtonLabel = savedTemplate.button_label || (template === "birthday" ? "Open your BINZEO profile" : button_label);
  const finalButtonUrl = savedTemplate.button_url || (template === "birthday" ? `${siteUrl}/dashboard/profile` : button_url);
  const finalTheme = savedTemplate.theme === "light" || savedTemplate.theme === "dark" ? savedTemplate.theme : theme;
  const finalImages = Array.isArray(savedTemplate.images) ? savedTemplate.images : images;
  const finalButtons = Array.isArray(savedTemplate.buttons) ? savedTemplate.buttons : [];
  if (!finalSubject || !finalHeadline || (!finalMessage && template !== "birthday")) return fail("Subject, headline and message are required", 422, "VALIDATION_ERROR");
  const previewHtml = buildEmail({ siteUrl, template, preheader: finalPreheader, headline: finalHeadline, message: finalMessage, recipient_name: "there", button_label: finalButtonLabel, button_url: finalButtonUrl, images: finalImages, buttons: finalButtons, unsubscribe_url, theme: finalTheme });
  const recipients = await getRecipients(context.admin, teamIds, selectedUserIds);
  if (body.action === "preview") return ok({ subject: finalSubject, html: previewHtml, recipient_count: recipients.length, smtp_source: "auth.binzeo" });
  if (body.action !== "send") return fail("Choose preview or send", 422, "VALIDATION_ERROR");
  const inlineImages: Awaited<ReturnType<typeof prepareInlineImage>>[] = [];
  try { for (const [index, image] of finalImages.entries()) inlineImages.push(await prepareInlineImage(image.url, `marketing-image-${index}@binzeo`, `marketing-image-${index + 1}`)); } catch (error) { return fail(error instanceof Error ? error.message : "The email image could not be embedded", 422, "IMAGE_EMBED_FAILED"); }
  if (!recipients.length) return fail("Select at least one eligible active user or team", 422, "NO_RECIPIENTS");
  const { data: campaign, error: campaignError } = await (context.admin.from("marketing_email_campaigns") as any).insert({ subject: finalSubject, preview_text: finalPreheader, html_body: previewHtml, created_by: context.user.id, status: "sending", recipient_count: recipients.length, started_at: new Date().toISOString(), theme: finalTheme, template_type: template, template_id: selectedSavedTemplate?.id ?? null, birthday_year: template === "birthday" ? birthdayYear : null, target_team_ids: teamIds, target_user_ids: selectedUserIds }).select("id").single();
  if (campaignError || !campaign) return fail(campaignError?.message ?? "Campaign could not be created", 500, "CAMPAIGN_CREATE_FAILED");
  const { error: deliveryError } = await (context.admin.from("marketing_email_deliveries") as any).insert(recipients.map((recipient) => ({ campaign_id: campaign.id, user_id: recipient.user_id, email: recipient.email, consent_snapshot: true, status: "pending" })));
  if (deliveryError) return fail(deliveryError.message, 500, "DELIVERY_CREATE_FAILED");
  let sent = 0; let failed = 0; let skipped = 0;
  for (const recipient of recipients) {
    let birthdayClaimId: string | null = null;
    if (template === "birthday") {
      const { data: claim, error: claimError } = await (context.admin.from("birthday_email_deliveries") as any).insert({ user_id: recipient.user_id, birthday_year: birthdayYear, email: recipient.email, campaign_id: campaign.id, status: "sending" }).select("id").single();
      if (claimError?.code === "23505") {
        skipped += 1;
        await (context.admin.from("marketing_email_deliveries") as any).update({ status: "skipped", error_message: `Birthday email already sent for ${birthdayYear}.` }).eq("campaign_id", campaign.id).eq("email", recipient.email);
        continue;
      }
      if (claimError || !claim) {
        failed += 1;
        await (context.admin.from("marketing_email_deliveries") as any).update({ status: "failed", error_message: claimError?.message ?? "Birthday delivery guard failed" }).eq("campaign_id", campaign.id).eq("email", recipient.email);
        continue;
      }
      birthdayClaimId = claim.id;
    }
    try {
      const recipientHtml = buildEmail({ siteUrl, template, preheader: finalPreheader, headline: finalHeadline, message: finalMessage, recipient_name: recipient.display_name ?? "there", button_label: finalButtonLabel, button_url: finalButtonUrl, images: finalImages, buttons: finalButtons, unsubscribe_url, theme: finalTheme });
      const sendHtml = inlineImages.reduce((html, image) => image.html(html), recipientHtml);
      const info = await transporter.sendMail({ from: EMAIL_FROM, to: recipient.email, subject: finalSubject, html: sendHtml, attachments: inlineImages.map((image) => image.attachment) });
      sent += 1;
      await (context.admin.from("marketing_email_deliveries") as any).update({ status: "sent", sent_at: new Date().toISOString(), provider_message_id: info.messageId ?? null }).eq("campaign_id", campaign.id).eq("email", recipient.email);
      if (birthdayClaimId) {
        await (context.admin.from("birthday_email_deliveries") as any).update({ status: "sent", sent_at: new Date().toISOString(), provider_message_id: info.messageId ?? null, updated_at: new Date().toISOString() }).eq("id", birthdayClaimId);
        await (context.admin.from("user_birthdays") as any).update({ last_birthday_wish_year: birthdayYear, last_birthday_wish_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("user_id", recipient.user_id);
      }
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : "Send failed";
      await (context.admin.from("marketing_email_deliveries") as any).update({ status: "failed", error_message: message }).eq("campaign_id", campaign.id).eq("email", recipient.email);
      if (birthdayClaimId) await (context.admin.from("birthday_email_deliveries") as any).update({ status: "failed", error_message: message, updated_at: new Date().toISOString() }).eq("id", birthdayClaimId);
    }
  }
  await (context.admin.from("marketing_email_campaigns") as any).update({ status: failed ? (sent ? "partial" : "failed") : "sent", sent_count: sent, failed_count: failed, skipped_count: skipped, completed_at: new Date().toISOString() }).eq("id", campaign.id);
  await context.admin.from("admin_activity_logs").insert([{ admin_user_id: context.user.id, action_type: "marketing_campaign_sent", target_type: "marketing_email_campaign", target_id: campaign.id, description: `Marketing campaign sent through auth.binzeo SMTP. Sent ${sent}, failed ${failed}.`, metadata: { sent, failed, recipient_count: recipients.length, team_ids: teamIds, theme, smtp_source: "auth.binzeo", consent_filter: "profiles.marketing_email = true and account_status = active" } }] as never);
  return ok({ campaign_id: campaign.id, recipient_count: recipients.length, sent, failed, skipped, smtp_source: "auth.binzeo" });
}
