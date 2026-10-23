/** Central Stripe Checkout endpoint. The server derives identity and amount from trusted records. */
export { POST } from "@/binzeo/api/v1/payments/checkout-sessions/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
