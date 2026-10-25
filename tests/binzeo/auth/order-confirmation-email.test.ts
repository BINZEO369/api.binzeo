import { describe, expect, it } from "vitest";
import { buildJabiyenOrderConfirmationEmail } from "@/binzeo/auth/lib/email/order-confirmation";

const sampleOrder = {
  order_number: "JBY-261024-ABC12345",
  customer: { name: "Amina <script>alert(1)</script>", email: "amina@example.test", phone: "+8801712345678" },
  shipping_address: { line1: "12 Main Road", city: "Dhaka", district: "Dhaka", country_code: "BD" },
  estimated_days_min: 2,
  estimated_days_max: 3,
  items: [{ product_name: "Cotton Shirt", variant_name: "Blue / M", quantity: 2 }],
};

describe("JABIYEN transactional order confirmation email", () => {
  it("uses the shared BINZEO Welcome shell and displays the COD order's USD equivalent only", () => {
    const email = buildJabiyenOrderConfirmationEmail({
      siteUrl: "https://auth-binzeo.vercel.app",
      order: sampleOrder,
      paymentMethod: "cod",
      orderAmountUsdMinor: 896,
    });

    expect(email.subject).toContain("JABIYEN JBY-261024-ABC12345");
    expect(email.html).toContain("/email-logo-white.png");
    expect(email.html).toContain("JABIYEN order confirmation");
    expect(email.html).toContain("USD 8.96");
    expect(email.html).toContain("Cash on Delivery");
    expect(email.html).toContain("USD amount is an estimated equivalent");
    expect(email.html).toContain("Qty 2");
    expect(email.html).not.toContain("BDT");
    expect(email.html).not.toContain("1,080.00");
    expect(email.html).toContain("Visit JABIYEN");
    expect(email.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(email.html).not.toContain("<script>alert(1)</script>");
  });

  it("shows the exact Stripe-paid USD amount and no local-currency amount", () => {
    const email = buildJabiyenOrderConfirmationEmail({
      siteUrl: "https://auth-binzeo.vercel.app",
      order: sampleOrder,
      paymentMethod: "stripe",
      orderAmountUsdMinor: 1099,
    });

    expect(email.subject).toContain("Payment confirmed");
    expect(email.html).toContain("USD 10.99");
    expect(email.html).toContain("Stripe · Paid");
    expect(email.html).not.toContain("BDT");
  });

  it("rejects an invalid order reference before putting it into email content", () => {
    expect(() => buildJabiyenOrderConfirmationEmail({
      siteUrl: "https://auth-binzeo.vercel.app",
      order: { ...sampleOrder, order_number: "<img src=x onerror=alert(1)>" },
      paymentMethod: "cod",
      orderAmountUsdMinor: 896,
    })).toThrow("Invalid JABIYEN order number");
  });
});
