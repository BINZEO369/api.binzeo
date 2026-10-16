import { runJabiyenGateway } from "@/admin/jabiyen/express-adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path: string[] }> };

async function handle(request: Request, context: Context) {
  const { path = [] } = await context.params;
  const { default: publicApi } = await import("@/admin/jabiyen/public-api");
  return runJabiyenGateway(publicApi, request, "/api/jabiyen-public", path);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
