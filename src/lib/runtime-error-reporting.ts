export function reportRuntimeError(error: unknown, context: Record<string, unknown> = {}) {
  const detail = error instanceof Error ? error.message : String(error);
  console.error('[ADEZ runtime error]', { detail, ...context });
}
