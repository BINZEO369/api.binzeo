import document from "@/platform/openapi.generated.json";
import { apiSuccess } from "@/platform/http/response";
import { getRequestId } from "@/platform/http/request-id";


export async function GET(request: Request) {
  return apiSuccess(document, getRequestId(request));
}
