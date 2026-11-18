// Privileged business operations shared by server functions and webhooks.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { gifted, paystack, shaker } from "./providers.server";
import { normalizedStatus, refundFor, TERMINAL } from "@/lib/pricing";

export const db = supabaseAdmin;

export async function walletApply(user: string, amount: number, type: string, description: string, reference: string) {
  const { data, error } = await db.rpc("wallet_apply", {
    _user: user, _amount: amount, _type: type, _description: description, _reference: reference,
  });
  if (error) throw new Error(error.message.includes("Insufficient") ? "Insufficient wallet balance." : error.message);
  return data as number;
}

export async function audit(actor: string, action: string, target: string, detail: string) {
  await db.from("audit_log").insert({ actor, action, target, detail });
}

export async function refreshOrder(orderId: string) {
  const { data: order } = await db.from("orders").select("*").eq("id", orderId).single();
  if (!order) throw new Error("Order not found.");
  if (!order.provider_order_id || TERMINAL.includes(order.status)) return order;
  const r = await shaker("status", { order: order.provider_order_id });
  const status = normalizedStatus(r.status);
  if (!status) throw new Error("Provider supplied an unknown order status.");
  const remains = Number(r.remains), startCount = Number(r.start_count);
  if (!Number.isSafeInteger(remains) || remains < 0 || remains > order.quantity) throw new Error("Provider supplied invalid progress.");
  const desired = refundFor(status, Number(order.charge), order.quantity, remains);
  const delta = Math.max(0, desired - Number(order.refund_amount));
  if (delta > 0) {
    const total = Number(order.refund_amount) + delta;
    await walletApply(order.user_id, delta, "refund", `${status} order refund`, `refund:${order.id}:${total}`);
  }
  const { data } = await db.from("orders").update({
    status, remains, start_count: Number.isSafeInteger(startCount) ? startCount : order.start_count,
    refund_amount: Number(order.refund_amount) + delta, updated_at: new Date().toISOString(),
  }).eq("id", orderId).select("*").single();
  return data;
}

export async function verifyPayment(paymentId: string) {
  const { data: p } = await db.from("payments").select("*").eq("id", paymentId).single();
  if (!p) throw new Error("Payment not found.");
  if (["completed", "failed", "review"].includes(p.status)) return p;
  let completed = false, failed = false, matches = false;
  if (p.gateway === "giftedpay") {
    if (!p.checkout_request_id) return p;
    const r = await gifted("verify", { checkoutRequestId: p.checkout_request_id });
    completed = r.success === true && r.status === "completed";
    failed = ["failed", "cancelled", "timeout"].includes(r.status);
    const d = r.data;
    matches = !!d && d.checkout_request_id === p.checkout_request_id && Math.round(Number(d.amount) * 100) === Number(p.pay_amount)
      && String(d.phone_number) === p.phone && Number(d.result_code) === 0 && !!d.mpesa_receipt_number;
  } else {
    const d = await paystack(`verify/${encodeURIComponent(p.reference)}`);
    completed = d.status === "success";
    failed = ["failed", "abandoned", "reversed"].includes(d.status);
    const { data: owner } = await db.from("profiles").select("email").eq("id", p.user_id).single();
    matches = d.reference === p.reference && d.amount === Number(p.pay_amount) && d.currency === p.pay_currency
      && d.channel === "card" && String(d.customer?.email ?? "").toLowerCase() === String(owner?.email ?? "").toLowerCase();
  }
  if (completed && !matches) {
    await db.from("payments").update({ status: "review", failure_reason: "Provider details do not match this payment." }).eq("id", p.id);
  } else if (completed) {
    await walletApply(p.user_id, Number(p.amount), "deposit", `${p.gateway === "giftedpay" ? "M-Pesa" : "Card"} wallet recharge`, `deposit:${p.reference}`);
    await db.from("payments").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", p.id);
  } else if (failed) {
    await db.from("payments").update({ status: "failed" }).eq("id", p.id).neq("status", "completed");
  }
  const { data } = await db.from("payments").select("*").eq("id", p.id).single();
  return data;
}
