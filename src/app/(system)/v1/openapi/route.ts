import document from "@/openapi.generated.json";
import { apiSuccess } from "@/lib/http/response";
import { getRequestId } from "@/lib/http/request-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return apiSuccess(document, getRequestId(request));
}
