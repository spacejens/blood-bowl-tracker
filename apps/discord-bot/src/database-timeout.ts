// apps/discord-bot/src/database-timeout.ts  (temporary shim, removed in Task 8)
export { DATABASE_TIMEOUT_MS } from './database-timeout.service';
import { DatabaseTimeoutService } from './database-timeout.service';
const shared = new DatabaseTimeoutService();
export async function withDatabaseTimeout<T>(
  work: Promise<T>,
  fallback: T,
  timeoutMs?: number,
): Promise<T> {
  return shared.run(work, fallback, timeoutMs);
}
