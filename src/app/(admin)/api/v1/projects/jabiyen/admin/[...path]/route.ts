/** Next.js route adapter; implementation lives under src/binzeo or src/jabiyen; shared helpers live under src/common. */
export { GET, OPTIONS, POST, PUT, PATCH, DELETE } from "@/jabiyen/api/v1/projects/jabiyen/admin/[...path]/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
