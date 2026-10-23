import document from "@/binzeo/openapi.generated.json";
import { apiSuccess } from "@/common/http/response";
import { getRequestId } from "@/common/http/request-id";


export async function GET(request: Request) {
  return apiSuccess(document, getRequestId(request));
}
