import { escapeEmailText, renderEmailLayout } from "@/user/auth/lib/email/layout";

export type EmailAlignment = "left" | "center" | "right";
export type EmailImageSize = "small" | "medium" | "large" | "banner";
export type EmailContentBlock =
  | { id: string; type: "headline"; text: string; align?: EmailAlignment }
  | { id: string; type: "message"; text: string; align?: EmailAlignment }
  | { id: string; type: "button"; label: string; url: string; align?: EmailAlignment; width?: "auto" | "full" }
  | {
      id: string;
      type: "image";
      url: string;
      size?: EmailImageSize;
      align?: EmailAlignment;
      layout?: "full" | "side-left" | "side-right";
      overlay_enabled?: boolean;
      overlay_title?: string;
      overlay_subtitle?: string;
      overlay_align?: EmailAlignment;
      overlay_position?: "top" | "middle" | "bottom";
      overlay_button_label?: string;
      overlay_button_url?: string;
    };

export type EmailTemplateRenderInput = {
  template_type: string;
  theme?: string | null;
  subject?: string | null;
  preview_text?: string | null;
  headline?: string | null;
  message?: string | null;
  button_label?: string | null;
  button_url?: string | null;
  buttons?: unknown;
  images?: unknown;
  content_blocks?: unknown;
};

const BLOCK_LIMIT = 32;
const IMAGE_LIMIT = 8;
const BUTTON_LIMIT = 8;
const HTTPS_ONLY = /^https:\/\//i;
const alignments = ["left", "center", "right"] as const;
const imageSizes = ["small", "medium", "large", "banner"] as const;
const imageLayouts = ["full", "side-left", "side-right"] as const;
const overlayPositions = ["top", "middle", "bottom"] as const;

export function safeEmailUrl(value: unknown) {
  if (typeof value !== "string" || !HTTPS_ONLY.test(value.trim())) return "";
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function cssSafeEmailUrl(value: string) {
  return value.replace(/[\\'"()\s<>]/g, (character) => `%${character.charCodeAt(0).toString(16).padStart(2, "0")}`);
}

function safeAlignment(value: unknown): EmailAlignment {
  return alignments.includes(value as EmailAlignment) ? value as EmailAlignment : "left";
}

export function parseContentBlocks(value: unknown, strict = false): { blocks: EmailContentBlock[]; error?: string } {
  if (value == null) return { blocks: [] };
  if (!Array.isArray(value)) return { blocks: [], error: "Content blocks must be a list." };
  if (value.length > BLOCK_LIMIT) return { blocks: [], error: `Use no more than ${BLOCK_LIMIT} content blocks.` };

  const blocks: EmailContentBlock[] = [];
  let imageCount = 0;
  let buttonCount = 0;
  for (const [index, item] of value.entries()) {
    if (!item || typeof item !== "object") return { blocks: [], error: "A content block is invalid." };
    const row = item as Record<string, unknown>;
    const id = typeof row.id === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(row.id) ? row.id : `block-${index + 1}`;
    if (row.type === "headline" || row.type === "message") {
      const maxLength = row.type === "headline" ? 180 : 10000;
      const text = typeof row.text === "string" ? row.text.slice(0, maxLength) : "";
      if (strict && typeof row.text === "string" && row.text.length > maxLength) {
        return { blocks: [], error: `${row.type === "headline" ? "Headlines" : "Messages"} must be ${maxLength} characters or fewer.` };
      }
      blocks.push(row.type === "headline"
        ? { id, type: "headline", text, align: safeAlignment(row.align) }
        : { id, type: "message", text, align: safeAlignment(row.align) });
      continue;
    }
    if (row.type === "button") {
      buttonCount += 1;
      if (buttonCount > BUTTON_LIMIT) return { blocks: [], error: `Use no more than ${BUTTON_LIMIT} buttons.` };
      const rawLabel = typeof row.label === "string" ? row.label.trim() : "";
      const label = rawLabel.slice(0, 80);
      const rawUrl = typeof row.url === "string" ? row.url.trim() : "";
      const url = safeEmailUrl(rawUrl);
      if (strict && rawLabel.length > 80) return { blocks: [], error: "Button labels must be 80 characters or fewer." };
      if (strict && (label || rawUrl) && (!label || !url)) {
        return { blocks: [], error: "Each button needs a label and a valid HTTPS URL." };
      }
      blocks.push({
        id,
        type: "button",
        label,
        url,
        align: safeAlignment(row.align),
        width: row.width === "full" ? "full" : "auto",
      });
      continue;
    }
    if (row.type === "image") {
      imageCount += 1;
      if (imageCount > IMAGE_LIMIT) return { blocks: [], error: `Use no more than ${IMAGE_LIMIT} image blocks.` };
      const rawUrl = typeof row.url === "string" ? row.url.trim() : "";
      const url = safeEmailUrl(rawUrl);
      if (strict && !url) return { blocks: [], error: "Each image block needs a valid HTTPS image URL." };
      const rawTitle = typeof row.overlay_title === "string" ? row.overlay_title.trim() : "";
      const rawSubtitle = typeof row.overlay_subtitle === "string" ? row.overlay_subtitle.trim() : "";
      const overlayButtonLabel = typeof row.overlay_button_label === "string" ? row.overlay_button_label.trim() : "";
      const overlayButtonUrlRaw = typeof row.overlay_button_url === "string" ? row.overlay_button_url.trim() : "";
      const overlayButtonUrl = safeEmailUrl(overlayButtonUrlRaw);
      const overlayEnabled = row.overlay_enabled === true;
      if (strict && rawTitle.length > 180) return { blocks: [], error: "Image overlay titles must be 180 characters or fewer." };
      if (strict && rawSubtitle.length > 360) return { blocks: [], error: "Image overlay subtitles must be 360 characters or fewer." };
      if (strict && overlayButtonLabel.length > 80) return { blocks: [], error: "Image overlay button labels must be 80 characters or fewer." };
      if (strict && (overlayButtonLabel || overlayButtonUrlRaw) && (!overlayEnabled || !overlayButtonLabel || !overlayButtonUrl)) {
        return { blocks: [], error: "An image overlay button needs the overlay enabled, a label and a valid HTTPS URL." };
      }
      if (overlayButtonLabel && overlayButtonUrl) {
        buttonCount += 1;
        if (buttonCount > BUTTON_LIMIT) return { blocks: [], error: `Use no more than ${BUTTON_LIMIT} buttons, including image-overlay buttons.` };
      }
      if (strict && overlayEnabled && !rawTitle && !rawSubtitle && !overlayButtonLabel) {
        return { blocks: [], error: "Add a title, subtitle or button to the image overlay." };
      }
      const size: EmailImageSize = imageSizes.includes(row.size as never) ? row.size as EmailImageSize : "medium";
      const layout = imageLayouts.includes(row.layout as never) ? row.layout as "full" | "side-left" | "side-right" : "full";
      const overlayPosition = overlayPositions.includes(row.overlay_position as never) ? row.overlay_position as "top" | "middle" | "bottom" : "middle";
      blocks.push({
        id,
        type: "image",
        url,
        size,
        align: safeAlignment(row.align),
        layout,
        overlay_enabled: overlayEnabled,
        overlay_title: rawTitle.slice(0, 180),
        overlay_subtitle: rawSubtitle.slice(0, 360),
        overlay_align: safeAlignment(row.overlay_align),
        overlay_position: overlayPosition,
        overlay_button_label: overlayButtonLabel.slice(0, 80),
        overlay_button_url: overlayButtonUrl,
      });
      continue;
    }
    return { blocks: [], error: "A content block type is not supported." };
  }
  return { blocks };
}

function personalize(text: string, name: string) {
  return escapeEmailText(text.replaceAll("{{name}}", name).replaceAll("[Name]", name)).replace(/\n/g, "<br>");
}

function safeImages(value: unknown) {
  return Array.isArray(value) ? value.slice(0, IMAGE_LIMIT).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Record<string, unknown>;
    const url = safeEmailUrl(row.url);
    const position = ["top", "after_headline", "after_message", "before_button"].includes(String(row.position)) ? String(row.position) : "after_message";
    return url ? [{ url, position }] : [];
  }) : [];
}

function imageMarkup(images: ReturnType<typeof safeImages>, position: string) {
  return images.filter((image) => image.position === position).map((image) => `<p style="margin:24px 0;text-align:center"><img src="${escapeEmailText(image.url)}" alt="" style="display:block;width:100%;max-width:560px;height:auto;border:0;margin:0 auto" /></p>`).join("");
}

function renderTextBlock(block: Extract<EmailContentBlock, { type: "headline" | "message" }>, ink: string, name: string, preview: boolean) {
  const align = safeAlignment(block.align);
  if (block.type === "headline") {
    const text = block.text || (preview ? "Headline preview" : "");
    return text ? `<h2 style="margin:28px 0 14px;color:${ink};font-size:22px;line-height:1.3;font-weight:750;letter-spacing:-.025em;text-align:${align}">${personalize(text, name)}</h2>` : "";
  }
  const text = block.text || (preview ? "Message preview" : "");
  return text ? `<div style="margin:0 0 18px;color:${ink};font-size:14px;line-height:1.7;white-space:pre-wrap;text-align:${align}">${personalize(text, name)}</div>` : "";
}

function renderButtonBlock(block: Extract<EmailContentBlock, { type: "button" }>, ink: string, preview: boolean) {
  const label = block.label || (preview ? "Button preview" : "");
  if (!label) return "";
  const align = safeAlignment(block.align);
  const full = block.width === "full";
  const url = safeEmailUrl(block.url);
  const buttonStyle = `display:${full ? "block" : "inline-block"};${full ? "width:100%;box-sizing:border-box;" : ""}border:1px solid ${ink};border-radius:6px;padding:11px 15px;color:${ink};font-size:13px;font-weight:700;text-decoration:none;text-align:center`;
  const contents = url
    ? `<a href="${escapeEmailText(url)}" style="${buttonStyle}">${escapeEmailText(label)} →</a>`
    : preview ? `<span style="${buttonStyle}">${escapeEmailText(label)} →</span>` : "";
  return contents ? `<div style="margin:0 0 16px;text-align:${align}">${contents}</div>` : "";
}

function imageSize(size: EmailImageSize | undefined) {
  switch (size) {
    case "small": return { width: 220, height: 150 };
    case "large": return { width: 520, height: 260 };
    case "banner": return { width: 560, height: 240 };
    default: return { width: 360, height: 210 };
  }
}

function renderImageBlock(
  block: Extract<EmailContentBlock, { type: "image" }>,
  name: string,
  preview: boolean,
  sideCell = false,
) {
  const url = safeEmailUrl(block.url);
  if (!url && !preview) return "";
  const { width: presetWidth, height } = imageSize(block.size);
  const width = sideCell ? Math.min(presetWidth, 190) : presetWidth;
  const align = safeAlignment(block.align);
  const margin = align === "left" ? "0 auto 0 0" : align === "right" ? "0 0 0 auto" : "0 auto";
  const alt = escapeEmailText(block.overlay_title ?? "");

  if (block.overlay_enabled) {
    const overlayAlign = safeAlignment(block.overlay_align);
    const valign = block.overlay_position === "top" ? "top" : block.overlay_position === "bottom" ? "bottom" : "middle";
    const title = block.overlay_title ? `<div style="margin:0 0 8px;color:#ffffff;font-size:22px;line-height:1.2;font-weight:800">${personalize(block.overlay_title, name)}</div>` : "";
    const subtitle = block.overlay_subtitle ? `<div style="margin:0 0 12px;color:#ffffff;font-size:14px;line-height:1.5">${personalize(block.overlay_subtitle, name)}</div>` : "";
    const overlayButtonUrl = safeEmailUrl(block.overlay_button_url);
    const overlayButton = block.overlay_button_label
      ? overlayButtonUrl
        ? `<a href="${escapeEmailText(overlayButtonUrl)}" style="display:inline-block;border:1px solid #ffffff;border-radius:5px;padding:9px 13px;color:#ffffff;font-size:12px;font-weight:700;text-decoration:none">${escapeEmailText(block.overlay_button_label)} →</a>`
        : preview ? `<span style="display:inline-block;border:1px solid #ffffff;border-radius:5px;padding:9px 13px;color:#ffffff;font-size:12px;font-weight:700">${escapeEmailText(block.overlay_button_label)} →</span>` : ""
      : "";
    const overlay = `${title}${subtitle}${overlayButton}` || (preview ? `<div style="color:#ffffff;font-size:14px;font-weight:700">Image overlay preview</div>` : "");
    const background = url ? ` background="${escapeEmailText(url)}" style="background-color:#333333;background-image:url('${escapeEmailText(cssSafeEmailUrl(url))}');background-position:center;background-size:cover;background-repeat:no-repeat;height:${height}px;vertical-align:${valign};text-align:${overlayAlign}"` : ` style="background-color:#333333;height:${height}px;vertical-align:${valign};text-align:${overlayAlign}"`;
    const vmlUrl = url || "https://placehold.co/560x240/333333/ffffff.png?text=Image+preview";
    const overlayMarkup = `<div style="padding:20px;text-align:${overlayAlign};color:#ffffff;font-family:Arial,sans-serif">${overlay}</div>`;
    const outlook = url
      ? `<!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${width}" style="width:${width}px"><tr><td><v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:${width}px;height:${height}px"><v:fill type="frame" src="${escapeEmailText(vmlUrl)}" color="#333333"/><v:textbox inset="0,0,0,0" style="mso-fit-shape-to-text:false">${overlayMarkup}</v:textbox></v:rect></td></tr></table><![endif]-->`
      : "";
    const modern = `<!--[if !mso]><!--><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${width}" style="width:100%;max-width:${width}px;margin:${margin}"><tr><td width="${width}" height="${height}"${background}>${overlayMarkup}</td></tr></table><!--<![endif]-->`;
    return `<div style="margin:18px 0;text-align:${align}">${outlook}${modern}</div>`;
  }

  if (!url) {
    return preview ? `<div style="width:100%;max-width:${width}px;height:${Math.min(height, 210)}px;margin:18px ${align === "left" ? "auto 0" : align === "right" ? "0 0 0 auto" : "auto"};background:#333333;color:#ffffff;display:table;text-align:center"><span style="display:table-cell;vertical-align:middle">Image preview</span></div>` : "";
  }
  return `<div style="margin:18px 0;text-align:${align}"><img src="${escapeEmailText(url)}" width="${width}" alt="${alt}" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;margin:${margin}" /></div>`;
}

function renderBlock(block: EmailContentBlock, ink: string, name: string, preview: boolean) {
  if (block.type === "headline" || block.type === "message") return renderTextBlock(block, ink, name, preview);
  if (block.type === "image") return renderImageBlock(block, name, preview);
  return renderButtonBlock(block, ink, preview);
}

function renderSidePair(image: Extract<EmailContentBlock, { type: "image" }>, text: Extract<EmailContentBlock, { type: "headline" | "message" }>, ink: string, name: string, preview: boolean) {
  const imageMarkup = renderImageBlock(image, name, preview, true);
  const textMarkup = renderTextBlock(text, ink, name, preview);
  const imageCell = `<td width="36%" valign="middle" style="width:36%;padding:0 10px 0 0">${imageMarkup}</td>`;
  const textCell = `<td width="64%" valign="middle" style="width:64%;padding:0 0 0 10px">${textMarkup}</td>`;
  const cells = image.layout === "side-right" ? `${textCell}${imageCell}` : `${imageCell}${textCell}`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;margin:14px 0"><tr>${cells}</tr></table>`;
}

export function renderEmailTemplateHtml(template: EmailTemplateRenderInput, siteUrl: string, recipientName = "there", preview = false) {
  const name = recipientName.trim() || "there";
  const theme = template.theme === "light" ? "light" : "dark";
  const ink = theme === "light" ? "#000000" : "#ffffff";
  const type = template.template_type;
  const occasionBlocks = type === "occasion" ? parseContentBlocks(template.content_blocks).blocks : [];
  const blockMode = type === "occasion" && occasionBlocks.length > 0;
  const images = safeImages(template.images);
  const renderImages = (position: string) => imageMarkup(images, position);
  const greeting = `<p style="margin:0 0 22px;color:${ink};font-size:16px;line-height:1.5;font-weight:700">Hey ${escapeEmailText(name)},</p>`;
  const preheader = typeof template.preview_text === "string" ? template.preview_text : "";
  let title = typeof template.headline === "string" ? template.headline : "";
  let body = "";

  if (blockMode) {
    title = "";
    const insertedImages = new Set<string>(["top"]);
    const parts = [greeting, renderImages("top")];
    const firstIndex = (blockType: EmailContentBlock["type"]) => occasionBlocks.findIndex((block) => block.type === blockType);
    const headlineIndex = firstIndex("headline");
    const messageIndex = firstIndex("message");
    const buttonIndex = firstIndex("button");
    for (let index = 0; index < occasionBlocks.length; index += 1) {
      const block = occasionBlocks[index];
      if (block.type === "image" && block.layout !== "full") {
        const next = occasionBlocks[index + 1];
        if (next && (next.type === "headline" || next.type === "message")) {
          parts.push(renderSidePair(block, next, ink, name, preview));
          index += 1;
          continue;
        }
      }
      if (index === buttonIndex && !insertedImages.has("before_button")) {
        parts.push(renderImages("before_button"));
        insertedImages.add("before_button");
      }
      parts.push(renderBlock(block, ink, name, preview));
      if (index === headlineIndex && !insertedImages.has("after_headline")) {
        parts.push(renderImages("after_headline"));
        insertedImages.add("after_headline");
      }
      if (index === messageIndex && !insertedImages.has("after_message")) {
        parts.push(renderImages("after_message"));
        insertedImages.add("after_message");
      }
    }
    for (const position of ["after_headline", "after_message", "before_button"]) {
      if (!insertedImages.has(position)) parts.push(renderImages(position));
    }
    body = parts.join("");
  } else {
    const headline = title || (preview ? "Headline preview" : "");
    title = headline;
    const messageText = typeof template.message === "string" && template.message.trim() ? template.message : (preview ? "Message preview" : "");
    const legacyButtons = Array.isArray(template.buttons) ? template.buttons.slice(0, BUTTON_LIMIT).flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      const label = typeof row.label === "string" ? row.label.trim().slice(0, 80) : "";
      const url = safeEmailUrl(row.url);
      return label && url ? [{ label, url }] : [];
    }) : [];
    if (!legacyButtons.length && typeof template.button_label === "string" && template.button_label.trim()) {
      const url = safeEmailUrl(template.button_url);
      if (url) legacyButtons.push({ label: template.button_label.trim().slice(0, 80), url });
    }
    const buttonHtml = legacyButtons.map((button) => `<div style="padding:0 0 12px;text-align:left"><a href="${escapeEmailText(button.url)}" style="color:${ink};font-size:14px;font-weight:700;text-decoration:underline;text-underline-offset:4px">${escapeEmailText(button.label)} →</a></div>`).join("");
    body = `${greeting}${renderImages("top")}${renderImages("after_headline")}${messageText ? `<div style="color:${ink};font-size:14px;line-height:1.7;white-space:pre-wrap">${personalize(messageText, name)}</div>` : ""}${renderImages("after_message")}${renderImages("before_button")}${buttonHtml}`;
  }

  const footerLink = `${siteUrl.replace(/\/+$/, "")}/dashboard/profile#notifications`;
  const footerNote = type === "occasion"
    ? `You are receiving this occasion email because marketing emails are enabled in your BINZEO notification preferences. <a href="${escapeEmailText(footerLink)}" style="color:${ink};text-decoration:underline;">Manage email preferences</a>.`
    : type === "birthday"
      ? `A birthday wish from BINZEO. <a href="${escapeEmailText(footerLink)}" style="color:${ink};text-decoration:underline;">Manage email preferences</a>.`
      : `You are receiving this email because you allowed Marketing emails in your BINZEO notification preferences. <a href="${escapeEmailText(footerLink)}" style="color:${ink};text-decoration:underline;">Manage email preferences</a>.`;
  const eyebrow = type === "occasion" ? "BINZEO · OCCASION WISH" : type === "birthday" ? "BINZEO · BIRTHDAY" : "BINZEO · NEWS";
  return renderEmailLayout({ siteUrl, eyebrow, title: escapeEmailText(title), description: escapeEmailText(preheader), body, showSecurityDetails: false, theme, footerNote });
}
