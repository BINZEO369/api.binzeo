/**
 * Resolve the origin of a Central Auth payment-page request.
 * Browsers may omit Origin on same-origin GET fetches, so only that case may
 * fall back to a Referer whose Fetch Metadata explicitly says same-origin.
 */
export function getPaymentUiRequestOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (origin) return origin;

  if (
    request.method.toUpperCase() !== "GET" ||
    request.headers.get("sec-fetch-site") !== "same-origin"
  ) {
    return null;
  }

  const referer = request.headers.get("referer");
  if (!referer) return null;

  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}
