import nodemailer from "nodemailer";
import { emailButton, emailCodeBlock, renderEmailLayout, type EmailSecurityContext } from "@/modules/identity/lib/email/layout";

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT ?? 587),
  secure: false,
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 15_000,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export const EMAIL_FROM = `"BINZEO" <${process.env.SMTP_USER}>`;

export function getPublicSiteUrl(headers?: { get(name: string): string | null }) {
  const forwardedHost = headers?.get("x-forwarded-host") ?? headers?.get("host");
  if (forwardedHost) {
    const forwardedProto = headers?.get("x-forwarded-proto") ?? "https";
    return `${forwardedProto.split(",")[0].trim()}://${forwardedHost.split(",")[0].trim()}`.replace(/\/+$/, "");
  }
  const configuredUrl = process.env.AUTH_APP_URL?.trim();
  if (configuredUrl) return configuredUrl.replace(/\/+$/, "");
  throw new Error("NEXT_PUBLIC_SITE_URL or a public request host is required for email images");
}

export function buildOtpEmail(code: string, expiresInSeconds = 30, siteUrl: string, context?: EmailSecurityContext) {
  return {
    subject: "BINZEO Account Security — Your verification code",
    html: renderEmailLayout({
      siteUrl,
      eyebrow: "Account verification",
      title: "Verify your email address",
      description: "Use the verification code below to continue setting up your BINZEO account.",
      context,
      body: emailCodeBlock("BINZEO verification code", code, expiresInSeconds) + `<p style="margin:18px 0 0;color:#ffffff;font-size:12px;line-height:1.6;text-align:center;">Never share this code. BINZEO will never ask for it by phone or email.</p>`,
      footerNote: "If you did not request this code, you can safely ignore this email.",
    }),
  };
}

export function buildWelcomeEmail(siteUrl: string, context?: EmailSecurityContext) {
  return {
    subject: "Welcome to BINZEO — your identity is ready",
    html: renderEmailLayout({
      siteUrl,
      eyebrow: "Welcome to BINZEO",
      title: "Your identity is ready",
      description: "Your email is verified and your secure digital identity is ready to use.",
      context,
      body: emailButton("Open your dashboard", `${siteUrl.replace(/\/+$/, "")}/dashboard`) + `<p style="margin:22px 0 0;color:#ffffff;font-size:12px;line-height:1.6;text-align:center;">Manage your profile, security, devices, and connections from one trusted place.</p>`,
      footerNote: "You received this email because your BINZEO account was successfully verified.",
    }),
  };
}

export function buildPasswordResetEmail(code: string, expiresInSeconds: number, siteUrl: string, context?: EmailSecurityContext) {
  return {
    subject: "Password Reset — Your BINZEO verification code",
    html: renderEmailLayout({
      siteUrl,
      eyebrow: "Account security",
      title: "Reset your password",
      description: "Use this verification code to securely set a new password for your BINZEO account.",
      context,
      body: emailCodeBlock("Password verification code", code, expiresInSeconds) + `<p style="margin:18px 0 0;color:#ffffff;font-size:12px;line-height:1.6;text-align:center;">Never share this code. BINZEO will never ask for it by phone or email.</p>`,
      footerNote: "If you did not request a password reset, secure your account immediately.",
    }),
  };
}

export function buildPasswordChangedEmail(siteUrl: string, context?: EmailSecurityContext) {
  return {
    subject: "Password Changed — BINZEO account security notification",
    html: renderEmailLayout({
      siteUrl,
      eyebrow: "Account security",
      title: "Password changed",
      description: "Your BINZEO account password was changed successfully.",
      context,
      body: emailButton("Review security", `${siteUrl.replace(/\/+$/, "")}/dashboard/security`) + `<p style="margin:22px 0 0;color:#ffffff;font-size:12px;line-height:1.6;text-align:center;">If you did not make this change, secure your account immediately and contact support.</p>`,
      footerNote: "This message was sent to help protect your BINZEO account.",
    }),
  };
}
