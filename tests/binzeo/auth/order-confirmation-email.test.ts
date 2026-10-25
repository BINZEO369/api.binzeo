import { describe, expect, it } from "vitest";
import { buildJabiyenOrderConfirmationEmail } from "@/binzeo/auth/lib/email/order-confirmation";

const sampleOrder = {
  order_number: "JBY-261024-ABC12345",
  customer: { name: "Amina <script>alert(1)</script>", email: "amina@example.test", phone: "+8801712345678" },
  shipping_address: { line1: "12 Main Road", city: "Dhaka", district: "Dhaka", country_code: "BD" },
  subtotal: "1000.00",
  delivery_fee: "80.00",
  total_amount: "1080.00",
  delivery_type: "Standard",
  estimated_days_min: 2,
  estimated_days_max: 3,
  currency: "BDT",
  items: [{ product_name: "Cotton Shirt", variant_name: "Blue / M", quantity: 2, unit_price: "500.00", line_total: "1000.00" }],
};

describe("JABIYEN transactional order confirmation email", () => {
  it("uses the shared BINZEO Welcome email shell and includes the COD order and amount due", () => {
    const email = buildJabiyenOrderConfirmationEmail({
      siteUrl: "https://auth-binzeo.vercel.app",
      order: sampleOrder,
      paymentMethod: "cod",
    });

    expect(email.subject).toContain("JABIYEN JBY-261024-ABC12345");
    expect(email.html).toContain("/email-logo-white.png");
    expect(email.html).toContain("JABIYEN order confirmation");
    expect(email.html).toContain("Cash on Delivery");
    expect(email.html).toContain("BDT 1,080.00");
    expect(email.html).toContain("BDT 80.00");
    expect(email.html).toContain("Visit JABIYEN");
    expect(email.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(email.html).not.toContain("<script>alert(1)</script>");
  });

  it("labels online payment as paid and includes the actual Stripe charge separately from BDT order total", () => {
    const email = buildJabiyenOrderConfirmationEmail({
      siteUrl: "https://auth-binzeo.vercel.app",
      order: sampleOrder,
      paymentMethod: "stripe",
      stripeAmountMinor: 1099,
      stripeCurrency: "usd",
    });

    expect(email.subject).toContain("Payment confirmed");
    expect(email.html).toContain("Stripe · Paid USD 10.99");
    expect(email.html).toContain("JABIYEN order total");
    expect(email.html).toContain("BDT 1,080.00");
  });

  it("rejects an invalid order reference before putting it into email content", () => {
    expect(() => buildJabiyenOrderConfirmationEmail({
      siteUrl: "https://auth-binzeo.vercel.app",
      order: { ...sampleOrder, order_number: "<img src=x onerror=alert(1)>" },
      paymentMethod: "cod",
    })).toThrow("Invalid JABIYEN order number");
  });
});
