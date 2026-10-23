/** Next.js route adapter; site-specific implementation is kept under src/sites. */
export { GET, PATCH, DELETE } from "@/sites/binzeo/server/routes/api/admin/tracking/[table]/[id]/route";

export const dynamic = "force-dynamic";
