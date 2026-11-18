import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { getCurrentUser } from '@/lib/auth-rpc';

export const Route = createFileRoute('/_authenticated')({
  ssr: true,
  beforeLoad: async () => {
    try {
      await getCurrentUser();
    } catch {
      throw redirect({ to: '/auth' });
    }
  },
  component: () => <Outlet />,
});
