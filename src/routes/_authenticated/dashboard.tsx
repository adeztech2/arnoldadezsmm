import { createFileRoute } from '@tanstack/react-router';
import { getCurrentUser } from '@/lib/auth-rpc';

export const Route = createFileRoute('/_authenticated/dashboard')({
  head: () => ({ meta: [{ title: 'Dashboard — ADEZ SMM' }] }),
  loader: () => getCurrentUser(),
  component: Dashboard,
});

function Dashboard() {
  const user = Route.useLoaderData();
  return (
    <main className="min-h-screen bg-background p-6">
      <h1 className="font-serif text-3xl text-foreground">Welcome</h1>
      <p className="mt-2 text-muted-foreground">Signed in with Manus as {user.email || user.name || user.openId}</p>
      <a href="/manus-oauth/logout" className="mt-6 inline-block rounded-lg border border-border px-4 py-2 text-foreground">
        Sign out
      </a>
    </main>
  );
}
