import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const orderInput = z.object({
  serviceId: z.string().uuid(),
  idempotencyKey: z.string().regex(/^[a-z0-9_.-]{16,100}$/i),
  link: z.string().max(2000).optional(),
  quantity: z.number().int().positive().optional(),
  fields: z.record(z.string().max(20000)).optional(),
});

export const placeOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.infer<typeof orderInput>) => orderInput.parse(i))
  .handler(async ({ data, context }) => {
    const { db, walletApply } = await import("./core.server");
    const { shaker, ProviderError } = await import("./providers.server");
    const { orderPrice } = await import("@/lib/pricing");
    const userId = context.userId;

    const { data: dup } = await db.from("orders").select("*").eq("user_id", userId).eq("idempotency_key", data.idempotencyKey).maybeSingle();
    if (dup) return dup;

    const [{ data: cfg }, { data: s }, { data: prof }] = await Promise.all([
      db.from("settings").select("*").eq("id", "site").single(),
      db.from("services").select("*").eq("id", data.serviceId).single(),
      db.from("profiles").select("disabled").eq("id", userId).single(),
    ]);
    if (!cfg || !s || !prof) throw new Error("Service not found.");
    if (prof.disabled) throw new Error("Your account is disabled.");
    if (cfg.maintenance) throw new Error("Ordering is paused for maintenance.");
    if (!s.enabled || !s.available || !s.supported) throw new Error("This service is not available.");
    if (s.provider_currency !== cfg.provider_currency) throw new Error("Provider currency conversion is not configured.");

    // Validate fields required by the service type
    const payload: Record<string, string | number> = {};
    const f = data.fields ?? {};
    for (const field of s.requirements) {
      if (field === "link" || field === "media") {
        const v = field === "link" ? data.link : f[field];
        let u: URL;
        try { u = new URL(String(v)); } catch { throw new Error(`Enter a valid ${field} URL.`); }
        if (!/^https?:$/.test(u.protocol)) throw new Error(`Enter a valid ${field} URL.`);
        payload[field] = u.href;
      } else if (field === "quantity") {
        const q = data.quantity ?? 0;
        if (q < s.min || q > s.max) throw new Error(`Quantity must be between ${s.min} and ${s.max}.`);
        payload['quantity'] = q;
      } else if (field === "answer_number") {
        const n = Number(f[field]);
        if (!Number.isInteger(n) || n < 1 || n > 100) throw new Error("Enter a poll answer number.");
        payload[field] = n;
      } else {
        const v = String(f[field] ?? "").trim();
        if (!v) throw new Error(`Enter ${field.replace("_", " ")}.`);
        payload[field] = v;
      }
    }
    let quantity = Number(payload['quantity'] ?? 0);
    if (s.pricing_unit === "package") quantity = 1;
    else if (payload['comments']) quantity = String(payload['comments']).split(/\r?\n/).filter((x) => x.trim()).length;
    else if (s.type.toLowerCase() === "mentions custom list") quantity = String(payload['usernames']).split(/\r?\n/).filter((x) => x.trim()).length;
    if (s.pricing_unit !== "package" && (quantity < s.min || quantity > s.max)) throw new Error(`Quantity must be between ${s.min} and ${s.max}.`);

    const { charge, providerCost } = orderPrice(s, Number(cfg.provider_to_wallet_rate), quantity);
    const { link: _l, quantity: _q, ...extra } = payload;

    const { data: order, error } = await db.from("orders").insert({
      user_id: userId, service_id: s.id, service_name: s.name, provider_service_id: s.provider_id,
      idempotency_key: data.idempotencyKey, link: String(payload['link'] ?? ""), quantity, fields: extra,
      charge, provider_cost: providerCost, remains: quantity, refill: s.refill, cancel: s.cancel, status: "Reserving",
    }).select("*").single();
    if (error || !order) throw new Error("Could not create order.");

    try {
      await walletApply(userId, -charge, "order", s.name, `order:${order.id}`);
    } catch (e) {
      await db.from("orders").delete().eq("id", order.id);
      throw e;
    }
    await db.from("orders").update({ status: "Submitting" }).eq("id", order.id);

    try {
      const r = await shaker("add", { service: s.provider_id, ...payload });
      const pid = String(r.order ?? "");
      await db.from("orders").update(/^\d+$/.test(pid)
        ? { provider_order_id: pid, status: "Pending" }
        : { status: "Submission uncertain" }).eq("id", order.id);
    } catch (e) {
      if (e instanceof ProviderError && e.rejected && !e.uncertain) {
        await walletApply(userId, charge, "refund", "Provider rejected the order", `refund:${order.id}:${charge}`);
        await db.from("orders").update({ status: "Failed", refund_amount: charge }).eq("id", order.id);
        throw new Error(`${e.message}. Your wallet was refunded.`);
      }
      await db.from("orders").update({ status: "Submission uncertain" }).eq("id", order.id);
    }
    const { data: final } = await db.from("orders").select("*").eq("id", order.id).single();
    return final!;
  });

export const refreshMyOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: own } = await context.supabase.from("orders").select("id,user_id").eq("id", data.id).single();
    if (!own || own.user_id !== context.userId) throw new Error("Order not found.");
    const { refreshOrder } = await import("./core.server");
    return refreshOrder(data.id);
  });

export const startDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { amount: number; phone?: string }) =>
    z.object({ amount: z.number().int().positive().max(100000000), phone: z.string().max(20).optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const { db } = await import("./core.server");
    const { gifted, paystack } = await import("./providers.server");
    const { kenyaPhone } = await import("@/lib/pricing");
    const [{ data: cfg }, { data: user }] = await Promise.all([
      db.from("settings").select("*").eq("id", "site").single(),
      db.from("profiles").select("*").eq("id", context.userId).single(),
    ]);
    if (!cfg || !user) throw new Error("Account not found.");
    if (user.disabled) throw new Error("Your account is disabled.");
    if (cfg.maintenance) throw new Error("Payments are paused for maintenance.");
    if (data.amount < Number(cfg.min_deposit)) throw new Error(`Minimum deposit is ${Number(cfg.min_deposit) / 100}.`);
    const gateway = user.country === "KE" ? "giftedpay" : "paystack";
    const rate = gateway === "giftedpay" ? 1 : Number(cfg.paystack_to_wallet_rate);
    if (!(rate > 0)) throw new Error("Payment exchange rate is not configured.");
    const payAmount = Math.ceil(data.amount / rate - 1e-8);
    if (gateway === "giftedpay" && payAmount % 100 !== 0) throw new Error("M-Pesa deposits must be whole shillings.");
    const phone = gateway === "giftedpay" ? kenyaPhone(data.phone ?? "") : null;
    const reference = `adez.${crypto.randomUUID()}`;
    const { data: p, error } = await db.from("payments").insert({
      user_id: user.id, reference, gateway, amount: data.amount, currency: cfg.wallet_currency,
      pay_amount: payAmount, pay_currency: gateway === "giftedpay" ? "KES" : cfg.paystack_currency, phone,
    }).select("*").single();
    if (error || !p) throw new Error("Could not start payment.");
    await db.from("profiles").update({ country_locked: true }).eq("id", user.id);
    try {
      if (gateway === "giftedpay") {
        const r = await gifted("process", { phone_number: phone, amount: payAmount / 100, account_reference: reference, transaction_desc: `${cfg.site_name} wallet recharge` });
        await db.from("payments").update({ status: "pending", checkout_request_id: String(r.checkout_request_id) }).eq("id", p.id);
        return { id: p.id, gateway, url: null as string | null };
      }
      const { getRequest } = await import("@tanstack/react-start/server");
      const origin = new URL(getRequest().url).origin;
      const r = await paystack("initialize", { email: user.email, amount: payAmount, currency: p.pay_currency, reference, channels: ["card"], callback_url: `${origin}/wallet?ref=${p.id}` });
      const url = new URL(r.authorization_url);
      if (url.protocol !== "https:" || url.hostname !== "checkout.paystack.com") throw new Error("Invalid checkout URL.");
      await db.from("payments").update({ status: "pending", authorization_url: url.href }).eq("id", p.id);
      return { id: p.id, gateway, url: url.href };
    } catch (e) {
      await db.from("payments").update({ status: "failed", failure_reason: (e as Error).message }).eq("id", p.id);
      throw e;
    }
  });

export const checkDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: own } = await context.supabase.from("payments").select("id,user_id").eq("id", data.id).single();
    if (!own || own.user_id !== context.userId) throw new Error("Payment not found.");
    const { verifyPayment } = await import("./core.server");
    return verifyPayment(data.id);
  });
