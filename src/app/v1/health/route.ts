import { apiSuccess } from "@/lib/http/response";
import { getRequestId } from "@/lib/http/request-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  return apiSuccess(
    { service: "api.binzeo", status: "ok", time: new Date().toISOString() },
    requestId,
  );
}
