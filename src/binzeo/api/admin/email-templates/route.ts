import { NextRequest } from "next/server";
import { getAdminServiceContext } from "@/binzeo/admin/lib/admin";
import { fail, ok } from "@/binzeo/auth/lib/api/response";
import { parseContentBlocks, type EmailContentBlock } from "@/binzeo/auth/lib/email/template-renderer";

const themes = ["dark", "light"] as const;
const types = ["birthday", "marketing", "occasion"] as const;
const positions = ["top", "after_headline", "after_message", "before_button"] as const;
const defaultTemplate = {
  name: "Birthday wishes",
  template_type: "birthday",
  theme: "dark",
  subject: "Happy Birthday from BINZEO",
  preview_text: "A special birthday wish from BINZEO.",
  headline: "Happy Birthday",
  message: "Wishing you a wonderful birthday!\nMay your new year be filled with meaningful connections, fresh opportunities, and beautiful moments.",
  button_label: "Open your BINZEO profile",
  button_url: "https://auth-binzeo.vercel.app/dashboard/profile",
  buttons: [{ label: "Open your BINZEO profile", url: "https://auth-binzeo.vercel.app/dashboard/profile" }],
  images: [],
  content_blocks: [],
  is_active: true,
};

async function context(request: NextRequest) {
  return getAdminServiceContext(request, "marketing.send");
}

function images(value: unknown) {
  return Array.isArray(value) ? value.slice(0, 8).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const x = item as Record<string, unknown>;
    const url = typeof x.url === "string" && /^https:\/\//i.test(x.url.trim()) ? x.url.trim().slice(0, 1000) : "";
    const position = positions.includes(x.position as never) ? String(x.position) : "after_message";
    return url ? [{ url, position }] : [];
  }) : [];
}

function buttons(value: unknown) {
  return Array.isArray(value) ? value.slice(0, 8).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const x = item as Record<string, unknown>;
    const label = typeof x.label === "string" ? x.label.trim().slice(0, 80) : "";
    const url = typeof x.url === "string" && /^https:\/\//i.test(x.url.trim()) ? x.url.trim().slice(0, 500) : "";
    return label && url ? [{ label, url }] : [];
  }) : [];
}

function legacyOccasionBlocks(body: Record<string, unknown>): EmailContentBlock[] {
  const blocks: EmailContentBlock[] = [];
  const headline = typeof body.headline === "string" ? body.headline.trim().slice(0, 180) : "";
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 10000) : "";
  if (headline) blocks.push({ id: "legacy-headline", type: "headline", text: headline });
  if (message) blocks.push({ id: "legacy-message", type: "message", text: message });
  for (const [index, button] of buttons(body.buttons).entries()) {
    blocks.push({ id: `legacy-button-${index + 1}`, type: "button", ...button });
  }
  if (!blocks.some((block) => block.type === "button")) {
    const fallback = buttons([{ label: body.button_label, url: body.button_url }])[0];
    if (fallback) blocks.push({ id: "legacy-button-1", type: "button", ...fallback });
  }
  return addLegacyImages(blocks, body.images);
}

function addLegacyImages(blocks: EmailContentBlock[], value: unknown): EmailContentBlock[] {
  const existingUrls = new Set(blocks.flatMap((block) => block.type === "image" ? [block.url] : []));
  const legacyImages = images(value).filter((image) => !existingUrls.has(image.url));
  if (!legacyImages.length) return blocks;
  const result = [...blocks];
  for (const [index, image] of [...legacyImages].reverse().entries()) {
    const imageBlock: EmailContentBlock = {
      id: `legacy-image-${legacyImages.length - index}`,
      type: "image",
      url: image.url,
      size: "banner",
      align: "center",
      layout: "full",
      overlay_enabled: false,
      overlay_title: "",
      overlay_subtitle: "",
      overlay_align: "center",
      overlay_position: "middle",
      overlay_button_label: "",
      overlay_button_url: "",
    };
    let position = result.length;
    if (image.position === "top") position = 0;
    if (image.position === "after_headline") {
      const headline = result.findIndex((block) => block.type === "headline");
      position = headline < 0 ? 0 : headline + 1;
    }
    if (image.position === "after_message") {
      const message = result.findIndex((block) => block.type === "message");
      position = message < 0 ? result.length : message + 1;
    }
    if (image.position === "before_button") {
      const button = result.findIndex((block) => block.type === "button");
      position = button < 0 ? result.length : button;
    }
    result.splice(position, 0, imageBlock);
  }
  return result;
}

const fields = "id,name,template_type,theme,subject,preview_text,headline,message,button_label,button_url,buttons,images,content_blocks,is_active,created_by,created_at,updated_at";

export async function GET(request: NextRequest) {
  const c = await context(request);
  if (!c) return fail("Email template permission required", 403, "EMAIL_TEMPLATE_FORBIDDEN");
  const { data, error } = await c.admin.from("email_templates").select(fields).eq("is_active", true).order("updated_at", { ascending: false }).limit(100);
  if (error) return fail(error.message, 500, "EMAIL_TEMPLATES_LOAD_FAILED");
  return ok({ templates: data ?? [], default_template: defaultTemplate });
}

export async function PUT(request: NextRequest) {
  const c = await context(request);
  if (!c) return fail("Email template permission required", 403, "EMAIL_TEMPLATE_FORBIDDEN");
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const templateType = types.includes(body.template_type as never) ? String(body.template_type) : "marketing";
  const defaultName = templateType === "birthday" ? "Birthday" : templateType === "occasion" ? "Occasion / festival" : "Marketing";
  const parsedBlocks = parseContentBlocks(body.content_blocks, true);
  if (parsedBlocks.error) return fail(parsedBlocks.error, 422, "EMAIL_TEMPLATE_BLOCKS_INVALID");
  const rawContentBlocks = templateType === "occasion"
    ? addLegacyImages(parsedBlocks.blocks.length ? parsedBlocks.blocks : legacyOccasionBlocks(body), body.images)
    : [];
  const normalizedContentBlocks = templateType === "occasion" ? parseContentBlocks(rawContentBlocks, true) : { blocks: [] as EmailContentBlock[] };
  if (normalizedContentBlocks.error) return fail(normalizedContentBlocks.error, 422, "EMAIL_TEMPLATE_BLOCKS_INVALID");
  const contentBlocks = normalizedContentBlocks.blocks;
  const blockHeadlines = contentBlocks.filter((block): block is Extract<EmailContentBlock, { type: "headline" }> => block.type === "headline" && Boolean(block.text.trim()));
  const blockMessages = contentBlocks.filter((block): block is Extract<EmailContentBlock, { type: "message" }> => block.type === "message" && Boolean(block.text.trim()));
  const blockButtons = contentBlocks.flatMap((block) => {
    if (block.type === "button" && block.label.trim() && block.url) return [{ label: block.label.trim(), url: block.url }];
    if (block.type === "image" && block.overlay_enabled && block.overlay_button_label?.trim() && block.overlay_button_url) {
      return [{ label: block.overlay_button_label.trim(), url: block.overlay_button_url }];
    }
    return [];
  });
  if (templateType === "occasion" && (!blockHeadlines.length || !blockMessages.length)) {
    return fail("Add at least one non-empty headline block and one message block before saving an Occasion template.", 422, "EMAIL_TEMPLATE_BLOCKS_INCOMPLETE");
  }

  const legacyButtons = buttons(body.buttons);
  const savedButtons = templateType === "occasion" ? blockButtons.map(({ label, url }) => ({ label, url })) : legacyButtons;
  const legacyHeadline = typeof body.headline === "string" && body.headline.trim() ? body.headline.trim().slice(0, 180) : "Hello from BINZEO";
  const legacyMessage = typeof body.message === "string" ? body.message.trim().slice(0, 10000) : "";
  const derivedHeadline = templateType === "occasion" ? blockHeadlines[0]?.text ?? legacyHeadline : legacyHeadline;
  const derivedMessage = templateType === "occasion" ? blockMessages.map((block) => block.text.trim()).join("\n\n").slice(0, 10000) : legacyMessage;
  const firstButton = savedButtons[0];
  const savedAt = new Date().toISOString();
  const payload = {
    name: typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 120) : `${defaultName} template`,
    template_type: templateType,
    theme: themes.includes(body.theme as never) ? body.theme : "dark",
    subject: typeof body.subject === "string" && body.subject.trim() ? body.subject.trim().replace(/[\r\n]+/g, " ").slice(0, 180) : "BINZEO update",
    preview_text: typeof body.preview_text === "string" ? body.preview_text.trim().slice(0, 240) : "",
    headline: derivedHeadline,
    message: derivedMessage,
    button_label: firstButton?.label ?? (typeof body.button_label === "string" ? body.button_label.trim().slice(0, 80) : ""),
    button_url: firstButton?.url ?? (typeof body.button_url === "string" ? body.button_url.trim().slice(0, 500) : ""),
    buttons: savedButtons,
    images: templateType === "occasion" ? [] : images(body.images),
    content_blocks: contentBlocks,
    is_active: true,
    updated_at: savedAt,
  };
  const id = typeof body.id === "string" ? body.id : "";
  if (templateType === "birthday") {
    await c.admin.from("email_templates").update({ is_active: false, updated_at: savedAt }).eq("template_type", "birthday").eq("is_active", true).neq("id", id || "00000000-0000-0000-0000-000000000000");
  }
  const query = id
    ? c.admin.from("email_templates").update(payload).eq("id", id).select(fields).single()
    : c.admin.from("email_templates").insert({ ...payload, created_by: c.user.id }).select(fields).single();
  const { data, error } = await query;
  if (error) return fail(error.message, 500, "EMAIL_TEMPLATE_SAVE_FAILED");
  return ok({ template: data });
}

export async function DELETE(request: NextRequest) {
  const c = await context(request);
  if (!c) return fail("Email template permission required", 403, "EMAIL_TEMPLATE_FORBIDDEN");
  const id = request.nextUrl.searchParams.get("id")?.trim() ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return fail("A valid template ID is required", 422, "EMAIL_TEMPLATE_ID_INVALID");
  }
  const { data, error } = await c.admin.from("email_templates").delete().eq("id", id).select("id").maybeSingle();
  if (error) return fail(error.message, 500, "EMAIL_TEMPLATE_DELETE_FAILED");
  if (!data) return fail("Template not found or already deleted", 404, "EMAIL_TEMPLATE_NOT_FOUND");
  return ok({ deleted_id: data.id });
}
