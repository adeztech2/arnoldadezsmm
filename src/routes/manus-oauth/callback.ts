import { createFileRoute } from '@tanstack/react-router';
import { establishSession, exchangeManusCode, verifyOAuthState, STATE_COOKIE } from '@/integrations/manus/auth';

export const Route = createFileRoute('/manus-oauth/callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        if (!code || !state) return Response.redirect(new URL('/auth?error=missing_oauth_response', url), 302);
        try {
          const redirectUri = verifyOAuthState(request, state);
          const identity = await exchangeManusCode(code, redirectUri);
          const session = await establishSession(identity);
          const headers = new Headers({ location: new URL('/dashboard', url).toString() });
          headers.append('set-cookie', session.setCookie);
          headers.append('set-cookie', `${STATE_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None`);
          return new Response(null, {
            status: 302,
            headers,
          });
        } catch (error) {
          console.error(error);
          return Response.redirect(new URL('/auth?error=oauth_failed', url), 302);
        }
      },
    },
  },
});
