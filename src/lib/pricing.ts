// Pure money/order rules shared by client and server. Wallet money is integer minor units (10000 = KES 100).

const TYPES: Record<string, string[]> = {
  default: ["link", "quantity"],
  "custom comments": ["link", "comments"],
  mentions: ["link", "quantity", "usernames"],
  "mentions with hashtags": ["link", "quantity", "usernames", "hashtags"],
  "mentions custom list": ["link", "usernames"],
  "mentions hashtag": ["link", "quantity", "hashtags"],
  "mentions user followers": ["link", "quantity", "username"],
  "mentions media likers": ["link", "quantity", "media"],
  "custom comments package": ["link", "comments"],
  "comment likes": ["link", "quantity", "username"],
  poll: ["link", "quantity", "answer_number"],
  "comment replies": ["link", "username", "comments"],
  "invites from groups": ["link", "quantity", "groups"],
  package: ["link"],
};

export function typeInfo(type: string) {
  const t = String(type).trim().toLowerCase();
  const req = TYPES[t];
  return { supported: !!req, requirements: req ?? [], pricingUnit: t.includes("package") ? "package" : "1000" };
}

export function formatMoney(minor: number, currency = "KES") {
  return `${currency} ${(minor / 100).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface PriceableService {
  selling_rate: number | null;
  provider_rate: number;
  pricing_unit: string;
}

/** Charge and provider cost in minor units for a quantity. */
export function orderPrice(s: PriceableService, providerToWalletRate: number, quantity: number) {
  if (s.selling_rate == null || !(s.selling_rate > 0)) throw new Error("This service is not available for ordering.");
  if (!(providerToWalletRate > 0)) throw new Error("Provider currency conversion is not configured.");
  const multiplier = s.pricing_unit === "package" ? 1 : quantity / 1000;
  const charge = Math.ceil(Number(s.selling_rate) * multiplier * 100 - 1e-8);
  const providerCost = Math.ceil(Number(s.provider_rate) * providerToWalletRate * multiplier * 100 - 1e-8);
  if (charge < 1) throw new Error("Order amount is too small.");
  return { charge, providerCost };
}

/** Default selling price for a newly imported service, per 1000 or per package, in wallet currency. */
export function defaultSellingRate(providerRate: number, rate: number, markupPercent: number) {
  if (!(rate > 0)) return null;
  return Math.ceil(providerRate * rate * (1 + markupPercent / 100) * 10000) / 10000;
}

/** Refund owed (minor units) for a provider status. */
export function refundFor(status: string, charge: number, quantity: number, remains: number) {
  if (status === "Canceled") return charge;
  if (status === "Partial" && quantity > 0) return Math.floor((charge * remains) / quantity);
  return 0;
}

export function kenyaPhone(value: string) {
  let p = value.replace(/[\s+()-]/g, "");
  if (/^0[17]\d{8}$/.test(p)) p = `254${p.slice(1)}`;
  if (!/^254[17]\d{8}$/.test(p)) throw new Error("Use a Kenyan mobile number such as 0712345678.");
  return p;
}

export function normalizedStatus(v: unknown) {
  const s = String(v ?? "").trim().toLowerCase();
  const map: Record<string, string> = {
    pending: "Pending", processing: "Processing", "in progress": "In progress",
    completed: "Completed", partial: "Partial", canceled: "Canceled", cancelled: "Canceled",
  };
  return map[s] ?? null;
}

export const TERMINAL = ["Completed", "Partial", "Canceled", "Failed"];
