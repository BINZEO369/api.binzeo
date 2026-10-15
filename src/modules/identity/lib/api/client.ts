export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: { message: string; code?: string; retry_after_seconds?: number } };

function isApiResponse<T>(value: unknown): value is ApiResponse<T> {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (record.success === true) return "data" in record;
  if (record.success === false) {
    return Boolean(record.error && typeof record.error === "object");
  }
  return false;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  let response: Response;
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;

  try {
    response = await fetch(path, {
      ...options,
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        ...(options.headers ?? {}),
      },
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    return {
      success: false,
      error: {
        message: "Unable to connect to BINZEO. Check your connection and try again.",
        code: "NETWORK_ERROR",
      },
    };
  }

  const raw = await response.text();
  let payload: unknown = null;
  if (raw.trim()) {
    try {
      payload = JSON.parse(raw) as unknown;
    } catch {
      // A platform/proxy HTML or text response is handled below with its HTTP status.
    }
  }

  if (isApiResponse<T>(payload)) return payload;

  if (!response.ok) {
    const statusMessage = response.status >= 500
      ? "BINZEO could not send the verification email right now. Please try again shortly."
      : `Request failed (${response.status}). Please try again.`;
    return {
      success: false,
      error: { message: statusMessage, code: `HTTP_${response.status}` },
    };
  }

  return {
    success: false,
    error: {
      message: "BINZEO returned an unexpected response. Please refresh and try again.",
      code: "INVALID_API_RESPONSE",
    },
  };
}
