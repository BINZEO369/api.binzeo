import { buildPasswordChangedEmail, EMAIL_FROM, transporter } from "@/modules/identity/lib/email/transporter";
import { getSupabaseAdmin } from "@/modules/identity/lib/supabase/admin";
import type { EmailSecurityContext } from "@/modules/identity/lib/email/layout";

type ChangeEvent = {
  id: string;
  notification_status: "pending" | "sent" | "failed";
  notification_attempt_count: number;
};

export async function markPasswordOtpEmail(
  challengeId: string,
  sent: boolean,
  errorMessage?: string,
) {
  const supabase = getSupabaseAdmin();
  await supabase
    .from("password_reset_challenges")
    .update({
      email_delivery_status: sent ? "sent" : "failed",
      email_sent_at: sent ? new Date().toISOString() : null,
      email_error: sent ? null : errorMessage ?? "Password OTP email failed",
    })
    .eq("id", challengeId);
}

export async function sendPasswordChangedEmailOnce({
  userId,
  email,
  challengeId,
  source,
  siteUrl,
  context,
}: {
  userId: string;
  email: string;
  challengeId: string;
  source: "reset" | "change";
  siteUrl: string;
  context?: EmailSecurityContext;
}) {
  const supabase = getSupabaseAdmin();
  const table = supabase.from("password_change_events");
  const now = new Date().toISOString();

  const { data: initialEvent, error } = await table
    .select("id, notification_status, notification_attempt_count")
    .eq("challenge_id", challengeId)
    .maybeSingle<ChangeEvent>();
  if (error) throw error;
  let event = initialEvent;
  if (event?.notification_status === "sent") return { sent: false, alreadySent: true };

  if (!event) {
    const { data: created, error: createError } = await table
      .insert({
        user_id: userId,
        challenge_id: challengeId,
        email,
        source,
        notification_status: "pending",
      })
      .select("id, notification_status, notification_attempt_count")
      .maybeSingle<ChangeEvent>();
    if (createError && createError.code !== "23505") throw createError;
    event = created;
    if (!event) {
      const { data: existing, error: existingError } = await table
        .select("id, notification_status, notification_attempt_count")
        .eq("challenge_id", challengeId)
        .maybeSingle<ChangeEvent>();
      if (existingError) throw existingError;
      event = existing;
    }
  }

  if (!event) throw new Error("Password change event could not be created");
  if (event.notification_status === "sent") return { sent: false, alreadySent: true };

  const { data: claimed, error: claimError } = await table
    .update({
      email,
      notification_status: "pending",
      notification_attempt_count: event.notification_attempt_count + 1,
      last_error: null,
      updated_at: now,
    })
    .eq("id", event.id)
    .in("notification_status", ["pending", "failed"])
    .select("id")
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return { sent: false, alreadyInProgress: true };

  try {
    const emailContent = buildPasswordChangedEmail(siteUrl, context);
    const info = await transporter.sendMail({
      from: EMAIL_FROM,
      to: email,
      subject: emailContent.subject,
      html: emailContent.html,
    });
    const { error: sentError } = await table
      .update({
        notification_status: "sent",
        notification_sent_at: new Date().toISOString(),
        provider_message_id: info.messageId ?? null,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", event.id);
    if (sentError) throw sentError;
    return { sent: true, alreadySent: false };
  } catch (sendError) {
    await table
      .update({
        notification_status: "failed",
        last_error: sendError instanceof Error ? sendError.message : "Password changed email failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", event.id);
    throw sendError;
  }
}
