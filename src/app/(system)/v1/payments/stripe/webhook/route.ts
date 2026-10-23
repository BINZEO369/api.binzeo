/** Stripe webhook endpoint; signature verification uses the untouched raw request body. */
export { POST } from "@/binzeo/api/v1/payments/stripe/webhook/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
