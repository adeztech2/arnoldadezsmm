import { createFileRoute } from '@tanstack/react-router';
import { createOAuthState, STATE_COOKIE } from '@/integrations/manus/auth';

export const Route = createFileRoute('/manus-oauth/start')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        const { nonce, state, redirectUri } = createOAuthState(origin);
        const url = new URL(`${process.env['MANUS_OAUTH_PORTAL_URL']}/app-auth`);
        url.searchParams.set('appId', process.env['MANUS_PROJECT_ID']!);
        url.searchParams.set('redirectUri', redirectUri);
        url.searchParams.set('state', state);
        url.searchParams.set('responseType', 'code');
        return new Response(null, {
          status: 302,
          headers: {
            location: url.toString(),
            'set-cookie': `${STATE_COOKIE}=${encodeURIComponent(nonce)}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=None`,
          },
        });
      },
    },
  },
});
