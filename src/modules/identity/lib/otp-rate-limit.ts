export function otpRateLimitResponse(rawMessage: string) {
  const message = rawMessage.toLowerCase();
  if (message.startsWith("otp_cooldown:")) {
    const seconds = Number.parseInt(rawMessage.split(":")[1] ?? "60", 10);
    return {
      status: 429,
      code: "OTP_COOLDOWN",
      message: `Please wait ${Number.isFinite(seconds) ? seconds : 60} seconds before requesting another code.`,
      retryAfter: Number.isFinite(seconds) ? seconds : 60,
    };
  }
  if (message.includes("otp_user_hourly_limit")) {
    return {
      status: 429,
      code: "OTP_USER_HOURLY_LIMIT",
      message: "You have reached the verification-code limit. Please try again later.",
      retryAfter: 3600,
    };
  }
  if (message.includes("otp_ip_hourly_limit")) {
    return {
      status: 429,
      code: "OTP_IP_HOURLY_LIMIT",
      message: "Too many verification-code requests from this network. Please try again later.",
      retryAfter: 3600,
    };
  }
  return null;
}
