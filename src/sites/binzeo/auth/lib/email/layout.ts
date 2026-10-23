export type EmailSecurityContext = {
  name?: string | null;
  time?: string | null;
  ipAddress?: string | null;
  location?: string | null;
  browser?: string | null;
};

export function escapeEmailText(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function contextValue(value: string | null | undefined) {
  return escapeEmailText(value?.trim() || "Not available");
}

export function emailSecurityDetails(context?: EmailSecurityContext) {
  const name = contextValue(context?.name || "there");
  const time = contextValue(context?.time || new Date().toUTCString());
  const ipAddress = contextValue(context?.ipAddress);
  const location = contextValue(context?.location);
  const browser = contextValue(context?.browser);
  return `<div style="padding:0;margin:0 0 28px;"><p style="margin:0 0 17px;color:#ffffff;font-size:16px;line-height:1.45;font-weight:700;">Hi ${name},</p><p style="margin:0 0 12px;color:#ffffff;font-size:10px;line-height:1.5;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;">Security details</p><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="color:#ffffff;font-size:11px;line-height:1.55;"><tr><td width="86" style="padding:2px 12px 2px 0;font-weight:700;vertical-align:top;">Time</td><td style="padding:2px 0;word-break:break-word;">${time}</td></tr><tr><td width="86" style="padding:2px 12px 2px 0;font-weight:700;vertical-align:top;">IP address</td><td style="padding:2px 0;word-break:break-word;">${ipAddress}</td></tr><tr><td width="86" style="padding:2px 12px 2px 0;font-weight:700;vertical-align:top;">Location</td><td style="padding:2px 0;word-break:break-word;">${location}</td></tr><tr><td width="86" style="padding:2px 12px 2px 0;font-weight:700;vertical-align:top;">Browser</td><td style="padding:2px 0;word-break:break-word;">${browser}</td></tr></table></div>`;
}

export function renderEmailLayout({
  siteUrl,
  eyebrow,
  title,
  description,
  body,
  context,
  showSecurityDetails = true,
  theme = "midnight",
  footerNote = "This is an automated security message from BINZEO.",
}: {
  siteUrl: string;
  eyebrow?: string;
  title: string;
  description?: string;
  body: string;
  context?: EmailSecurityContext;
  showSecurityDetails?: boolean;
  theme?: string;
  footerNote?: string;
}) {
  const logoUrl = `${siteUrl.replace(/\/+$/, "")}/email-logo-white.png`;
  const themeStyles: Record<string, { background: string; accent: string }> = {
    dark: { background: "#000000", accent: "#ffffff" },
    light: { background: "#ffffff", accent: "#000000" },
  };
  const selectedTheme = themeStyles[theme] ?? themeStyles.dark;
  const logoStyle = theme === "light" ? "display:block;width:180px;max-width:76%;height:auto;margin:0 auto;filter:invert(1);" : "display:block;width:180px;max-width:76%;height:auto;margin:0 auto;";
  const year = new Date().getFullYear();
  return `
    <div style="margin:0;padding:36px 22px;background:${selectedTheme.background};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${selectedTheme.accent};">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;margin:0 auto;">
        <tr><td style="padding:0;">
          <div style="padding:4px 0 34px;text-align:center;">
            <img src="${logoUrl}" width="180" alt="BINZEO" style="${logoStyle}" />
            ${eyebrow ? `<div style="margin-top:19px;color:${selectedTheme.accent};font-size:9px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;">${eyebrow}</div>` : ""}
          </div>
          <div style="padding:0;text-align:left;">
            ${title ? `<h1 style="margin:0;color:${selectedTheme.accent};font-size:27px;line-height:1.2;font-weight:750;letter-spacing:-0.035em;">${title}</h1>` : ""}
            ${description ? `<p style="margin:14px 0 0;color:${selectedTheme.accent};font-size:14px;line-height:1.7;">${description}</p>` : ""}
          </div>
          ${showSecurityDetails ? `<div style="padding:28px 0 0;">${emailSecurityDetails(context)}</div>` : ""}
          <div style="padding:0 0 34px;">${body}</div>
          <div style="padding:22px 0 0;border-top:1px solid ${selectedTheme.accent};text-align:left;">
            <p style="margin:0;color:${selectedTheme.accent};font-size:11px;line-height:1.65;">${footerNote}</p>
            <p style="margin:9px 0 0;color:${selectedTheme.accent};font-size:10px;line-height:1.5;">© ${year} BINZEO Inc. All rights reserved.</p>
          </div>
        </td></tr>
      </table>
    </div>
  `;
}

export function emailCodeBlock(label: string, code: string, expiresInSeconds: number) {
  return `<div style="padding:0 0 4px;text-align:left;"><div style="margin-bottom:10px;color:#ffffff;font-size:10px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;">${label}</div><div style="color:#ffffff;font-family:'SFMono-Regular',Consolas,'Liberation Mono',monospace;font-size:34px;line-height:1.2;font-weight:800;letter-spacing:8px;">${code}</div><div style="margin-top:11px;color:#ffffff;font-size:11px;">Expires in <strong style="color:#ffffff;">${expiresInSeconds} seconds</strong></div></div>`;
}

export function emailButton(label: string, href: string) {
  return `<div style="padding:0 0 2px;text-align:left;"><a href="${href}" style="color:#ffffff;font-size:14px;font-weight:700;text-decoration:underline;text-underline-offset:4px;">${label} →</a></div>`;
}
