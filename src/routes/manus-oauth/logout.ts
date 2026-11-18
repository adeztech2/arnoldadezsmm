import { createFileRoute } from '@tanstack/react-router';
import { clearCookie, SESSION_COOKIE } from '@/integrations/manus/auth';

export const Route = createFileRoute('/manus-oauth/logout')({
  server: {
    handlers: {
      GET: async ({ request }) => new Response(null, {
        status: 302,
        headers: {
          location: new URL('/auth', request.url).toString(),
          'set-cookie': clearCookie(SESSION_COOKIE),
        },
      }),
    },
  },
});
