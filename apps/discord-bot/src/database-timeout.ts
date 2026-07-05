/**
 * Default reply used when a database query does not respond in time.
 *
 * Exported for reuse: any database-backed reply that can time out should fall
 * back to this message so the bot stays responsive.
 */
export const DATABASE_TIMEOUT_FALLBACK_MESSAGE = 'I am stunned';

/**
 * How long to wait for the database before falling back. Kept comfortably
 * under Discord's ~3 second interaction-acknowledgement window so a slash
 * command can always reply in time.
 */
export const DATABASE_TIMEOUT_MS = 2_000;

/**
 * Resolves with the result of `work`, or with `fallback` if `work` does not
 * settle within `timeoutMs`. The timer is cleared once the race settles, and a
 * late rejection from `work` (after the timeout already won) is swallowed so it
 * does not surface as an unhandled rejection. A rejection that beats the
 * timeout still propagates to the caller.
 */
export async function withDatabaseTimeout<T>(
  work: Promise<T>,
  fallback: T,
  timeoutMs: number = DATABASE_TIMEOUT_MS,
): Promise<T> {
  // Swallow a late rejection if the timeout wins the race first.
  work.catch(() => undefined);

  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), timeoutMs);
  });

  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
