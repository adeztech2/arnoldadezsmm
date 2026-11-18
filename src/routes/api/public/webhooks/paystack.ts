import { createFileRoute } from '@tanstack/react-router';
import { query } from '@/db';

// Paystack webhook: signature verified; it only triggers re-verification, never credits directly.
export const Route = createFileRoute('/api/public/webhooks/paystack')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const { paystackSignatureValid } = await import('@/server/providers.server');
        if (!(await paystackSignatureValid(raw, request.headers.get('x-paystack-signature')))) return new Response('invalid signature', { status: 401 });
        let reference = '';
        try { reference = String(JSON.parse(raw)?.data?.reference ?? ''); } catch { return new Response('bad body', { status: 400 }); }
        const payments = await query<Array<{ id: string }>>('SELECT id FROM payments WHERE reference = ? LIMIT 1', [reference]);
        if (payments[0]) {
          try { await (await import('@/server/core.server')).verifyPayment(payments[0].id); } catch (error) { console.error(error); }
        }
        return new Response('ok');
      },
    },
  },
});
