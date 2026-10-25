import { emailButton, escapeEmailText, renderEmailLayout } from "@/binzeo/auth/lib/email/layout";

type EmailOrderItem = {
  product_name?: string | null;
  variant_name?: string | null;
  color_name?: string | null;
  size_name?: string | null;
  quantity?: number | null;
};

type JabiyenOrderSnapshot = {
  order_number: string;
  customer?: { name?: string | null; email?: string | null; phone?: string | null } | null;
  shipping_address?: Record<string, unknown> | null;
  estimated_days_min?: number | null;
  estimated_days_max?: number | null;
  items?: EmailOrderItem[] | null;
};

function formatUsdMinorAmount(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid USD amount for order confirmation");
  const minor = BigInt(value);
  const majorText = new Intl.NumberFormat("en-US").format(Number(minor / 100n));
  return `USD ${majorText}.${String(minor % 100n).padStart(2, "0")}`;
}

function safeJabiyenUrl() {
  const fallback = "https://jabiyen-website.vercel.app";
  try {
    const configured = new URL(process.env.JABIYEN_SITE_URL?.trim() || fallback);
    if (configured.protocol !== "https:" || configured.username || configured.password) return fallback;
    return configured.origin;
  } catch {
    return fallback;
  }
}

function addressText(address: JabiyenOrderSnapshot["shipping_address"]) {
  if (!address) return "Not provided";
  const keys = ["line1", "line2", "line3", "area", "city", "district", "state", "postal_code", "country_name", "country_code"];
  const values = keys
    .map((key) => address[key])
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .map((value) => escapeEmailText(value.trim()));
  return values.length ? values.join(", ") : "Not provided";
}

function detailRow(label: string, value: string, strong = false) {
  const weight = strong ? "700" : "400";
  return `<tr><td style="padding:8px 12px 8px 0;border-bottom:1px solid rgba(255,255,255,.22);color:#ffffff;font-size:12px;line-height:1.55;font-weight:${weight};vertical-align:top;">${label}</td><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.22);color:#ffffff;font-size:12px;line-height:1.55;font-weight:${weight};text-align:right;vertical-align:top;">${value}</td></tr>`;
}

export function buildJabiyenOrderConfirmationEmail({
  siteUrl,
  order,
  paymentMethod,
  orderAmountUsdMinor,
}: {
  siteUrl: string;
  order: JabiyenOrderSnapshot;
  paymentMethod: "cod" | "stripe";
  orderAmountUsdMinor: number;
}) {
  if (!/^JBY-\d{6}-[A-F0-9]{8}$/.test(order.order_number)) {
    throw new Error("Invalid JABIYEN order number for email template");
  }

  const orderNumber = escapeEmailText(order.order_number);
  const customerName = escapeEmailText(order.customer?.name?.trim() || "there");
  const itemRows = (order.items ?? []).slice(0, 20).map((item) => {
    const name = [item.product_name, item.variant_name, item.color_name, item.size_name]
      .filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
      .map((value) => escapeEmailText(value.trim()))
      .join(" · ") || "JABIYEN item";
    const quantity = Number.isInteger(item.quantity) && Number(item.quantity) > 0 ? Number(item.quantity) : 1;
    return `<tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,.22);color:#ffffff;font-size:12px;line-height:1.5;">${name}<br /><span style="font-size:11px;opacity:.82;">Qty ${quantity}</span></td></tr>`;
  }).join("");

  const amount = formatUsdMinorAmount(orderAmountUsdMinor);
  const paymentMethodLabel = paymentMethod === "cod" ? "Cash on Delivery" : "Stripe · Paid";
  const codNote = paymentMethod === "cod"
    ? `<p style="margin:0 0 18px;color:#ffffff;font-size:11px;line-height:1.6;opacity:.9;">The USD amount is an estimated equivalent for reference. Cash on Delivery is collected at delivery in the store's local currency.</p>`
    : "";
  const estimatedDelivery = Number.isInteger(order.estimated_days_min) && Number.isInteger(order.estimated_days_max)
    ? `${order.estimated_days_min}–${order.estimated_days_max} days`
    : "As advised by the store";
  const emailBody = `
    <p style="margin:0 0 18px;color:#ffffff;font-size:14px;line-height:1.6;">Hi ${customerName},</p>
    <p style="margin:0 0 20px;color:#ffffff;font-size:13px;line-height:1.65;">${paymentMethod === "stripe" ? "Your online payment has been confirmed. Your JABIYEN order is now ready for processing." : "We have received your JABIYEN order. Please pay the amount due to the delivery partner when your order arrives."}</p>
    <div style="margin:0 0 20px;padding:14px 16px;border:1px solid rgba(255,255,255,.4);">
      <div style="color:#ffffff;font-size:9px;line-height:1.5;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">Order ID</div>
      <div style="margin-top:5px;color:#ffffff;font-family:'SFMono-Regular',Consolas,'Liberation Mono',monospace;font-size:17px;line-height:1.4;font-weight:700;">${orderNumber}</div>
    </div>
    <div style="margin:0 0 8px;color:#ffffff;font-size:10px;line-height:1.5;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">Order items</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 18px;">${itemRows || `<tr><td style="padding:10px 0;color:#ffffff;font-size:12px;">Order items</td></tr>`}</table>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:0 0 18px;">
      ${detailRow("Order total (USD)", amount, true)}
      ${detailRow("Payment method", paymentMethodLabel)}
      ${detailRow("Estimated delivery", escapeEmailText(estimatedDelivery))}
    </table>
    ${codNote}
    <div style="margin:0 0 22px;">
      <div style="margin-bottom:5px;color:#ffffff;font-size:10px;line-height:1.5;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;">Delivering to</div>
      <div style="color:#ffffff;font-size:12px;line-height:1.65;">${escapeEmailText(addressText(order.shipping_address))}</div>
      ${order.customer?.phone ? `<div style="margin-top:4px;color:#ffffff;font-size:12px;line-height:1.5;">${escapeEmailText(order.customer.phone)}</div>` : ""}
    </div>
    ${emailButton("Visit JABIYEN", safeJabiyenUrl())}
  `;

  return {
    subject: `${paymentMethod === "stripe" ? "Payment confirmed" : "Order confirmed"} — JABIYEN ${order.order_number}`,
    html: renderEmailLayout({
      siteUrl,
      eyebrow: "JABIYEN order confirmation",
      title: paymentMethod === "stripe" ? "Payment confirmed" : "We've received your order",
      description: paymentMethod === "stripe"
        ? "Your payment was successfully verified by Stripe. Keep this email for your records."
        : "Your order is confirmed for Cash on Delivery. Keep this email for your records.",
      body: emailBody,
      showSecurityDetails: false,
      footerNote: "This transactional email confirms your JABIYEN order. If you did not place this order, contact JABIYEN support.",
    }),
  };
}
