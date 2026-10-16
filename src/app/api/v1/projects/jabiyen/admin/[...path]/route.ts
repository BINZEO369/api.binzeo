import { runJabiyenGateway } from "@/projects/jabiyen/server/express-adapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path: string[] }> };

async function handle(request: Request, context: Context) {
  const { path = [] } = await context.params;
  const { default: adminApi } = await import("@/projects/jabiyen/server/admin-api");
  return runJabiyenGateway(adminApi, request, "/api/jabiyen-admin", path);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
