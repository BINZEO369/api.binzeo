import { runJabiyenGateway } from "@/jabiyen/admin/express-adapter";


type Context = { params: Promise<{ path: string[] }> };

async function handle(request: Request, context: Context) {
  const { path = [] } = await context.params;
  const { default: adminApi } = await import("@/jabiyen/admin/admin-api");
  return runJabiyenGateway(adminApi, request, "/api/jabiyen-admin", path);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
export const OPTIONS = handle;
