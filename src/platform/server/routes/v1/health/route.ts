import { apiSuccess } from "@/platform/http/response";
import { getRequestId } from "@/platform/http/request-id";


export async function GET(request: Request) {
  const requestId = getRequestId(request);
  return apiSuccess(
    { service: "api.binzeo", status: "ok", time: new Date().toISOString() },
    requestId,
  );
}
