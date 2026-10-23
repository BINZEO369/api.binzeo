import { getSupabaseAdmin } from "@/sites/binzeo/auth/lib/supabase/admin";
import {
  buildWelcomeEmail,
  EMAIL_FROM,
  getPublicSiteUrl,
  transporter,
} from "@/sites/binzeo/auth/lib/email/transporter";
import type { EmailSecurityContext } from "@/sites/binzeo/auth/lib/email/layout";

const TEMPLATE_VERSION = "welcome-v1";

type DeliveryRow = {
  id: string;
  status: "pending" | "sending" | "sent" | "failed";
  attempt_count: number;
  sent_at: string | null;
};

export async function sendWelcomeEmailOnce({
  userId,
  email,
  siteUrl,
  context,
}: {
  userId: string;
  email: string;
  siteUrl?: string;
  context?: EmailSecurityContext;
}) {
  if (!email) throw new Error("Cannot send welcome email without a recipient");

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const table = supabase.from("welcome_email_deliveries");

  const { data: initialDelivery, error } = await table
    .select("id, status, attempt_count, sent_at")
    .eq("user_id", userId)
    .eq("template_version", TEMPLATE_VERSION)
    .maybeSingle<DeliveryRow>();

  if (error) throw error;
  let delivery = initialDelivery;
  if (delivery?.status === "sent") return { sent: false, alreadySent: true };

  if (!delivery) {
    const { data: created, error: createError } = await table
      .insert({
        user_id: userId,
        email,
        template_version: TEMPLATE_VERSION,
        status: "pending",
      })
      .select("id, status, attempt_count, sent_at")
      .maybeSingle<DeliveryRow>();

    if (createError && createError.code !== "23505") throw createError;
    delivery = created;

    if (!delivery) {
      const { data: existing, error: existingError } = await table
        .select("id, status, attempt_count, sent_at")
        .eq("user_id", userId)
        .eq("template_version", TEMPLATE_VERSION)
        .maybeSingle<DeliveryRow>();
      if (existingError) throw existingError;
      delivery = existing;
    }
  }

  if (!delivery) throw new Error("Welcome email delivery record could not be created");
  if (delivery.status === "sent") return { sent: false, alreadySent: true };

  const attemptCount = delivery.attempt_count + 1;
  const { data: claimed, error: claimError } = await table
    .update({
      email,
      status: "sending",
      attempt_count: attemptCount,
      last_attempt_at: now,
      last_error: null,
      updated_at: now,
    })
    .eq("id", delivery.id)
    .in("status", ["pending", "failed"])
    .select("id")
    .maybeSingle();

  if (claimError) throw claimError;
  if (!claimed) return { sent: false, alreadyInProgress: true };

  try {
    const emailContent = buildWelcomeEmail(siteUrl ?? "", context);
    const info = await transporter.sendMail({
      from: EMAIL_FROM,
      to: email,
      subject: emailContent.subject,
      html: emailContent.html,
    });

    const { error: sentError } = await table
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        next_attempt_at: null,
        last_error: null,
        provider_message_id: info.messageId ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", delivery.id);
    if (sentError) throw sentError;

    return { sent: true, alreadySent: false };
  } catch (sendError) {
    await table
      .update({
        status: "failed",
        next_attempt_at: null,
        last_error: sendError instanceof Error ? sendError.message : "Welcome email failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", delivery.id);
    throw sendError;
  }
}

export function getWelcomeSiteUrl(headers: { get(name: string): string | null }) {
  return getPublicSiteUrl(headers);
}
