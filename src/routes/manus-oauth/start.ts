import { createFileRoute } from '@tanstack/react-router';
import { createOAuthState, STATE_COOKIE } from '@/integrations/manus/auth';

export const Route = createFileRoute('/manus-oauth/start')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        const portalUrl = process.env['MANUS_OAUTH_PORTAL_URL'];
        const projectId = process.env['MANUS_PROJECT_ID'];
        if (!portalUrl || !projectId) {
          return new Response('Manus OAuth is not configured for this deployment.', {
            status: 503,
            headers: { 'content-type': 'text/plain; charset=utf-8' },
          });
        }
        const { nonce, state, redirectUri } = createOAuthState(origin);
        const url = new URL(`${portalUrl}/app-auth`);
        url.searchParams.set('appId', projectId);
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
