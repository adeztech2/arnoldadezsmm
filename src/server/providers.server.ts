// Server-only provider clients. Keys come from project secrets, never the browser.

export class ProviderError extends Error {
  constructor(message: string, public uncertain = false, public rejected = false) {
    super(message);
  }
}

function key(name: string) {
  const v = process.env[name];
  if (!v) throw new ProviderError(`${name} is not configured. Ask the site owner to add it.`);
  return v;
}

async function request(url: string, init: RequestInit, mayMutate: boolean) {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(18000), redirect: "error" });
  } catch {
    throw new ProviderError("Provider connection failed. Check the status before trying again.", mayMutate);
  }
  let body: any;
  try { body = await res.json(); } catch { throw new ProviderError("Provider returned an invalid response.", mayMutate); }
  if (!res.ok) throw new ProviderError("Provider rejected the request.", mayMutate && res.status >= 500, res.status < 500);
  return body;
}

export async function shaker(action: string, fields: Record<string, string | number> = {}) {
  const params = new URLSearchParams({ key: key("SHAKERGAINS_API_KEY"), action });
  for (const [k, v] of Object.entries(fields)) params.set(k, String(v));
  const r = await request("https://shakergainske.com/api/v2", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  }, action === "add");
  if (r && r.error) throw new ProviderError(`Service provider: ${String(r.error).slice(0, 200)}`, false, true);
  return r;
}

export async function gifted(path: "process" | "verify", payload: unknown) {
  const r = await request(`https://mpesa.gifted.co.ke/api/payments/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${key("GIFTEDPAY_API_KEY")}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
  }, path === "process");
  if (path === "process" && (!r.success || !r.checkout_request_id))
    throw new ProviderError("M-Pesa request was rejected. Check your phone number.", false, true);
  return r;
}

export async function paystack(path: string, payload?: unknown) {
  const r = await request(`https://api.paystack.co/transaction/${path}`, {
    method: payload ? "POST" : "GET",
    headers: { authorization: `Bearer ${key("PAYSTACK_SECRET_KEY")}`, "content-type": "application/json" },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  }, !!payload);
  if (!r.status || !r.data) throw new ProviderError("Paystack could not process this request.", false, true);
  return r.data;
}

export async function paystackSignatureValid(raw: string, signature: string | null) {
  if (!signature) return false;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key("PAYSTACK_SECRET_KEY")), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(raw));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hex.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}
