import { describe, it, expect } from "vitest";
import { orderPrice, refundFor, kenyaPhone, defaultSellingRate, typeInfo } from "@/lib/pricing";

describe("pricing rules", () => {
  it("charges per 1000 rounded up to the cent", () => {
    expect(orderPrice({ selling_rate: 150, provider_rate: 100, pricing_unit: "1000" }, 1, 500)).toEqual({ charge: 7500, providerCost: 5000 });
  });
  it("charges packages once regardless of quantity", () => {
    expect(orderPrice({ selling_rate: 20, provider_rate: 10, pricing_unit: "package" }, 1, 1).charge).toBe(2000);
  });
  it("refunds full charge on cancel and proportional remains on partial", () => {
    expect(refundFor("Canceled", 10000, 1000, 1000)).toBe(10000);
    expect(refundFor("Partial", 10000, 1000, 250)).toBe(2500);
    expect(refundFor("Completed", 10000, 1000, 0)).toBe(0);
  });
  it("normalizes Kenyan phones", () => {
    expect(kenyaPhone("0712345678")).toBe("254712345678");
    expect(() => kenyaPhone("12345")).toThrow();
  });
  it("applies default 30% markup", () => {
    expect(defaultSellingRate(100, 1, 30)).toBe(130);
  });
  it("detects package pricing", () => {
    expect(typeInfo("Package").pricingUnit).toBe("package");
  });
});
