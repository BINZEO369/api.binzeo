import { NextRequest } from "next/server";
import { getAdminServiceContext } from "@/sites/binzeo/admin/lib/admin";
import { fail, ok } from "@/sites/binzeo/auth/lib/api/response";

type ImageItem = { url: string; position: string };
const themes = ["dark", "light"] as const;
const positions = ["top", "after_headline", "after_message", "before_button"] as const;
const defaults = {
  name: "Birthday wishes",
  template_type: "birthday",
  theme: "dark",
  subject: "Happy Birthday from BINZEO",
  preview_text: "A special birthday wish from BINZEO.",
  headline: "Happy Birthday",
  message: "Wishing you a wonderful birthday!\nMay your new year be filled with meaningful connections, fresh opportunities, and beautiful moments.",
  button_label: "Open your BINZEO profile",
  button_url: "https://auth-binzeo.vercel.app/dashboard/profile",
  images: [] as ImageItem[],
  is_active: true,
  is_default: true,
};

function normalizeImages(value: unknown): ImageItem[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 8).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    const url = typeof candidate.url === "string" && /^https:\/\//i.test(candidate.url) ? candidate.url.trim().slice(0, 1000) : "";
    const position = positions.includes(candidate.position as never) ? String(candidate.position) : "after_message";
    return url ? [{ url, position }] : [];
  });
}

export async function GET(request: NextRequest) {
  const context = await getAdminServiceContext(request, "marketing.send");
  if (!context) return fail("Birthday template permission required", 403, "BIRTHDAY_TEMPLATE_FORBIDDEN");
  const { data, error } = await context.admin.from("email_templates").select("id,name,template_type,theme,subject,preview_text,headline,message,button_label,button_url,images,is_active,created_by,created_at,updated_at").eq("template_type", "birthday").eq("is_active", true).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) return fail(error.message, 500, "BIRTHDAY_TEMPLATE_LOAD_FAILED");
  return ok({ template: data ? { ...defaults, ...data, is_default: false, images: normalizeImages(data.images) } : defaults, saved: Boolean(data) });
}

export async function PUT(request: NextRequest) {
  const context = await getAdminServiceContext(request, "marketing.send");
  if (!context) return fail("Birthday template permission required", 403, "BIRTHDAY_TEMPLATE_FORBIDDEN");
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const template = {
    name: typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 120) : defaults.name,
    template_type: "birthday",
    theme: themes.includes(body.theme as typeof themes[number]) ? body.theme : defaults.theme,
    subject: typeof body.subject === "string" && body.subject.trim() ? body.subject.trim().slice(0, 180) : defaults.subject,
    preview_text: typeof body.preview_text === "string" ? body.preview_text.trim().slice(0, 240) : defaults.preview_text,
    headline: typeof body.headline === "string" && body.headline.trim() ? body.headline.trim().slice(0, 180) : defaults.headline,
    message: typeof body.message === "string" && body.message.trim() ? body.message.trim().slice(0, 10000) : defaults.message,
    button_label: typeof body.button_label === "string" ? body.button_label.trim().slice(0, 80) : defaults.button_label,
    button_url: typeof body.button_url === "string" ? body.button_url.trim().slice(0, 500) : defaults.button_url,
    images: normalizeImages(body.images),
    is_active: true,
    created_by: context.user.id,
  };
  const { data: existing, error: existingError } = await context.admin.from("email_templates").select("id").eq("template_type", "birthday").eq("is_active", true).limit(1).maybeSingle();
  if (existingError) return fail(existingError.message, 500, "BIRTHDAY_TEMPLATE_LOOKUP_FAILED");
  const query = existing
    ? context.admin.from("email_templates").update(template).eq("id", existing.id).select("id,name,template_type,theme,subject,preview_text,headline,message,button_label,button_url,images,is_active,created_by,created_at,updated_at").single()
    : context.admin.from("email_templates").insert(template).select("id,name,template_type,theme,subject,preview_text,headline,message,button_label,button_url,images,is_active,created_by,created_at,updated_at").single();
  const { data, error } = await query;
  if (error) return fail(error.message, 500, "BIRTHDAY_TEMPLATE_SAVE_FAILED");
  return ok({ template: { ...defaults, ...data, is_default: false, images: normalizeImages(data.images) }, saved: true });
}
