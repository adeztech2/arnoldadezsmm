import { createFileRoute } from "@tanstack/react-router";

// Paystack webhook: signature verified; it only triggers re-verification, never credits directly.
export const Route = createFileRoute("/api/public/webhooks/paystack")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const { paystackSignatureValid } = await import("@/server/providers.server");
        if (!(await paystackSignatureValid(raw, request.headers.get("x-paystack-signature"))))
          return new Response("invalid signature", { status: 401 });
        let ref = "";
        try { ref = String(JSON.parse(raw)?.data?.reference ?? ""); } catch { return new Response("bad body", { status: 400 }); }
        const { db, verifyPayment } = await import("@/server/core.server");
        const { data: p } = await db.from("payments").select("id").eq("reference", ref).maybeSingle();
        if (p) { try { await verifyPayment(p.id); } catch (e) { console.error(e); } }
        return new Response("ok");
      },
    },
  },
});
