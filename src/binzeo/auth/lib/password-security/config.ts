function boundedInt(name: string, fallback: number, min: number, max: number) {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

export const PASSWORD_OTP_EXPIRY_SECONDS = boundedInt(
  "PASSWORD_OTP_EXPIRY_SECONDS",
  600,
  60,
  900,
);
export const PASSWORD_OTP_COOLDOWN_SECONDS = boundedInt(
  "PASSWORD_OTP_COOLDOWN_SECONDS",
  60,
  30,
  3600,
);
export const PASSWORD_OTP_MAX_ATTEMPTS = boundedInt(
  "PASSWORD_OTP_MAX_ATTEMPTS",
  5,
  1,
  10,
);
export const PASSWORD_OTP_HOURLY_LIMIT = boundedInt(
  "PASSWORD_OTP_HOURLY_LIMIT",
  5,
  1,
  20,
);
