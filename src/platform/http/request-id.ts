const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export function getRequestId(request: Request): string {
  const incoming = request.headers.get("x-request-id")?.trim();
  if (incoming && REQUEST_ID_PATTERN.test(incoming)) return incoming;
  return crypto.randomUUID();
}
