import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/auth')({
  head: () => ({
    meta: [
      { title: 'Sign in — ADEZ SMM' },
      { name: 'description', content: 'Sign in to ADEZ SMM with your Manus account.' },
      { property: 'og:title', content: 'Sign in — ADEZ SMM' },
      { property: 'og:description', content: 'Sign in to ADEZ SMM with your Manus account.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const error = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('error') : null;
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-6 h-1 w-16 rounded-full bg-primary" />
        <h1 className="font-serif text-3xl text-foreground">ADEZ SMM</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Use your Manus account to sign in securely. Your application profile and permissions are stored in the ADEZ SMM database.
        </p>
        <a
          href="/manus-oauth/start"
          className="mt-6 block w-full rounded-lg bg-primary py-3 text-center font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Continue with Manus
        </a>
        {error && (
          <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            Sign in could not be completed. Please try again.
          </p>
        )}
        <p className="mt-6 text-xs leading-5 text-muted-foreground">
          No ADEZ-specific password is stored. Authentication is handled by Manus OAuth.
        </p>
      </div>
    </main>
  );
}
