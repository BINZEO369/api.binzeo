/** Next.js route adapter; site-specific implementation is kept under src/sites. */
export { GET, OPTIONS, POST, PUT, PATCH, DELETE } from "@/sites/jabiyen/server/routes/api/v1/projects/jabiyen/admin/[...path]/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
