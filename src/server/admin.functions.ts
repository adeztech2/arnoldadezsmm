import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function requireRole(supabase: any, userId: string, superOnly: boolean) {
  const { data: isSuper } = await supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" });
  if (isSuper) return;
  if (!superOnly) {
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (isAdmin) return;
  }
  throw new Error("Only the site owner can do this.");
}

export const syncCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireRole(context.supabase, context.userId, true);
    const { db, audit } = await import("./core.server");
    const { shaker } = await import("./providers.server");
    const { typeInfo, defaultSellingRate } = await import("@/lib/pricing");
    const bal = await shaker("balance");
    if (!/^[A-Z]{3}$/.test(String(bal.currency))) throw new Error("Provider did not supply a valid currency.");
    const rows = await shaker("services");
    if (!Array.isArray(rows) || !rows.length) throw new Error("Provider service list is empty. Existing services kept.");
    const { data: cfg } = await db.from("settings").select("*").eq("id", "site").single();
    const rate = bal.currency === "KES" ? 1 : Number(cfg!.provider_to_wallet_rate);
    const { data: existing } = await db.from("services").select("provider_id");
    const known = new Set((existing ?? []).map((e) => e.provider_id));
    const now = new Date().toISOString();
    const records = rows.map((r: any) => {
      const type = String(r.type || "Default");
      const info = typeInfo(type);
      const base = {
        provider_id: String(r.service), name: String(r.name ?? "").slice(0, 1000),
        category: String(r.category ?? "Other").slice(0, 300), type,
        min: Number(r.min) || 1, max: Number(r.max) || 1, provider_rate: Number(r.rate) || 0,
        provider_currency: bal.currency, supported: info.supported, requirements: info.requirements,
        pricing_unit: info.pricingUnit, refill: [true, "true", 1].includes(r.refill), cancel: [true, "true", 1].includes(r.cancel),
        description: String(r.description ?? "").slice(0, 4000), available: true, updated_at: now,
      };
      return known.has(base.provider_id) ? base
        : { ...base, enabled: false, selling_rate: defaultSellingRate(base.provider_rate, rate, Number(cfg!.default_markup_percent)) };
    });
    await db.from("services").update({ available: false }).neq("provider_id", "");
    const fresh = records.filter((r: any) => "enabled" in r), old = records.filter((r: any) => !("enabled" in r));
    for (let i = 0; i < fresh.length; i += 500) {
      const { error } = await db.from("services").insert(fresh.slice(i, i + 500));
      if (error) throw new Error(error.message);
    }
    for (let i = 0; i < old.length; i += 500) {
      const { error } = await db.from("services").upsert(old.slice(i, i + 500), { onConflict: "provider_id" });
      if (error) throw new Error(error.message);
    }
    await db.from("settings").update({ provider_currency: bal.currency, last_sync_at: now, ...(bal.currency === "KES" ? { provider_to_wallet_rate: 1 } : {}) }).eq("id", "site");
    await audit(context.userId, "services.synced", "catalog", `Imported ${records.length} services in ${bal.currency}`);
    return { count: records.length, currency: bal.currency, balance: bal.balance };
  });

export const updateService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; selling_rate?: number | null; enabled?: boolean }) =>
    z.object({ id: z.string().uuid(), selling_rate: z.number().nonnegative().max(10000000).nullable().optional(), enabled: z.boolean().optional() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireRole(context.supabase, context.userId, true);
    const { db, audit } = await import("./core.server");
    const { id } = data;
    const patch: { selling_rate?: number | null; enabled?: boolean } = {};
    if (data.selling_rate !== undefined) patch.selling_rate = data.selling_rate;
    if (data.enabled !== undefined) patch.enabled = data.enabled;
    const { error } = await db.from("services").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    await audit(context.userId, "service.updated", id, JSON.stringify(patch));
    return { ok: true };
  });

const settingsSchema = z.object({
  site_name: z.string().min(1).max(80), tagline: z.string().max(200), support_email: z.string().max(200),
  announcement: z.string().max(500), paystack_currency: z.string().regex(/^[A-Z]{3}$/),
  provider_to_wallet_rate: z.number().nonnegative(), paystack_to_wallet_rate: z.number().positive(),
  min_deposit: z.number().int().positive(), default_markup_percent: z.number().min(0).max(1000),
  registration_open: z.boolean(), maintenance: z.boolean(),
});
export const saveSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: z.infer<typeof settingsSchema>) => settingsSchema.parse(i))
  .handler(async ({ data, context }) => {
    await requireRole(context.supabase, context.userId, true);
    if (data.paystack_currency === "KES" && data.paystack_to_wallet_rate !== 1) throw new Error("KES to KES rate must be exactly 1.");
    const { db, audit } = await import("./core.server");
    const { error } = await db.from("settings").update(data).eq("id", "site");
    if (error) throw new Error(error.message);
    await audit(context.userId, "settings.updated", "site", "Settings saved");
    return { ok: true };
  });

export const adjustBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { userId: string; amount: number; reason: string; key: string }) =>
    z.object({ userId: z.string().uuid(), amount: z.number().int().refine((n) => n !== 0), reason: z.string().min(3).max(200), key: z.string().min(16).max(100) }).parse(i))
  .handler(async ({ data, context }) => {
    await requireRole(context.supabase, context.userId, true);
    const { walletApply, audit } = await import("./core.server");
    const bal = await walletApply(data.userId, data.amount, "adjustment", data.reason, `adjust:${data.key}`);
    await audit(context.userId, "balance.adjusted", data.userId, `${data.amount} — ${data.reason}`);
    return { balance: bal };
  });

export const setUserAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { userId: string; disabled?: boolean; admin?: boolean }) =>
    z.object({ userId: z.string().uuid(), disabled: z.boolean().optional(), admin: z.boolean().optional() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireRole(context.supabase, context.userId, true);
    if (data.userId === context.userId) throw new Error("You cannot change your own access.");
    const { db, audit } = await import("./core.server");
    if (data.disabled !== undefined) await db.from("profiles").update({ disabled: data.disabled }).eq("id", data.userId);
    if (data.admin === true) await db.from("user_roles").upsert({ user_id: data.userId, role: "admin" }, { onConflict: "user_id,role" });
    if (data.admin === false) await db.from("user_roles").delete().eq("user_id", data.userId).eq("role", "admin");
    await audit(context.userId, "user.access", data.userId, JSON.stringify(data));
    return { ok: true };
  });

export const adminRefreshOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireRole(context.supabase, context.userId, false);
    const { refreshOrder } = await import("./core.server");
    return refreshOrder(data.id);
  });

export const resolveUncertain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string; providerOrderId?: string }) =>
    z.object({ id: z.string().uuid(), providerOrderId: z.string().regex(/^\d+$/).optional() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireRole(context.supabase, context.userId, true);
    const { db, walletApply, audit } = await import("./core.server");
    const { data: o } = await db.from("orders").select("*").eq("id", data.id).single();
    if (!o || !["Submitting", "Submission uncertain"].includes(o.status)) throw new Error("Order is not awaiting review.");
    if (data.providerOrderId) {
      await db.from("orders").update({ provider_order_id: data.providerOrderId, status: "Pending" }).eq("id", o.id);
    } else {
      const due = Number(o.charge) - Number(o.refund_amount);
      if (due > 0) await walletApply(o.user_id, due, "refund", "Order not submitted", `refund:${o.id}:${o.charge}`);
      await db.from("orders").update({ status: "Failed", refund_amount: o.charge, provider_cost: 0 }).eq("id", o.id);
    }
    await audit(context.userId, "order.resolved", o.id, data.providerOrderId ?? "refunded");
    return { ok: true };
  });

export const adminVerifyPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await requireRole(context.supabase, context.userId, false);
    const { verifyPayment } = await import("./core.server");
    return verifyPayment(data.id);
  });
