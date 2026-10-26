/** Issues a short-lived, single-use JABIYEN return URL after server-side payment fulfillment. */
export { POST } from "@/binzeo/api/v1/payments/requests/[requestId]/return-handoff/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
