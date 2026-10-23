import { apiSuccess } from "@/common/http/response";
import { getRequestId } from "@/common/http/request-id";


export async function GET(request: Request) {
  const requestId = getRequestId(request);
  return apiSuccess(
    { service: "api.binzeo", status: "ok", time: new Date().toISOString() },
    requestId,
  );
}
