import { createServerFn } from '@tanstack/react-start';

export const getCurrentUser = createServerFn({ method: 'GET' }).handler(async () => {
  const { requireIdentity } = await import('@/integrations/manus/auth');
  return requireIdentity();
});
