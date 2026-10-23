/** Central payment status endpoint; only the authenticated request owner can read it. */
export { GET } from "@/binzeo/api/v1/payments/requests/[requestId]/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
