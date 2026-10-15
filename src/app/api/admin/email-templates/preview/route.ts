import { NextRequest } from "next/server";
import { getAdminServiceContext } from "@/modules/admin/lib/admin";
import { fail, ok } from "@/modules/identity/lib/api/response";
import { getPublicSiteUrl } from "@/modules/identity/lib/email/transporter";
import { parseContentBlocks, renderEmailTemplateHtml } from "@/modules/identity/lib/email/template-renderer";

const types = ["birthday", "marketing", "occasion"] as const;
const themes = ["dark", "light"] as const;

async function context(request: NextRequest) {
  return getAdminServiceContext(request, "marketing.send");
}

export async function POST(request: NextRequest) {
  const current = await context(request);
  if (!current) return fail("Email template permission required", 403, "EMAIL_TEMPLATE_FORBIDDEN");
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const templateType = types.includes(body.template_type as never) ? String(body.template_type) : "marketing";
  const parsedBlocks = parseContentBlocks(body.content_blocks);
  if (parsedBlocks.error) return fail(parsedBlocks.error, 422, "EMAIL_TEMPLATE_PREVIEW_INVALID");
  const subject = typeof body.subject === "string" ? body.subject.replace(/[\r\n]+/g, " ").trim().slice(0, 180) : "";
  const template = {
    template_type: templateType,
    theme: themes.includes(body.theme as never) ? String(body.theme) : "dark",
    subject,
    preview_text: typeof body.preview_text === "string" ? body.preview_text.slice(0, 240) : "",
    headline: typeof body.headline === "string" ? body.headline.slice(0, 180) : "",
    message: typeof body.message === "string" ? body.message.slice(0, 10000) : "",
    button_label: typeof body.button_label === "string" ? body.button_label.slice(0, 80) : "",
    button_url: typeof body.button_url === "string" ? body.button_url.slice(0, 500) : "",
    buttons: body.buttons,
    images: body.images,
    content_blocks: parsedBlocks.blocks,
  };
  const html = renderEmailTemplateHtml(template, getPublicSiteUrl(request.headers), "there", true);
  return ok({ subject, html, saved: false, email_sent: false });
}
