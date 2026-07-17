import type {
  ExternalSystemsImportService,
  ImportError,
} from '@blood-bowl-tracker/import';
import { makeImportError } from '@blood-bowl-tracker/import';

/**
 * Upsert the external systems an import needs, in order, returning their ids in
 * that same order. Rejects on the first failure — the caller decides what to
 * record and what to return, because each import service's early-return shape
 * is its own.
 */
export async function upsertExternalSystems(
  externalSystemsImport: ExternalSystemsImportService,
  names: readonly string[],
): Promise<number[]> {
  const ids: number[] = [];
  for (const name of names) {
    ids.push(await externalSystemsImport.upsertExternalSystem(name));
  }
  return ids;
}

/**
 * The ImportError every import service records when its external-system
 * bootstrap fails.
 *
 * `messagePrefix` exists only because two callers (players, positions) prefix
 * the message where the other seven do not. That inconsistency predates this
 * helper and a spec asserts on it, so it is preserved per caller rather than
 * silently normalised.
 */
export function externalSystemBootstrapError(
  names: readonly string[],
  error: unknown,
  messagePrefix = '',
): ImportError {
  return makeImportError({
    item: { externalSystems: [...names] },
    message: `${messagePrefix}${error instanceof Error ? error.message : String(error)}`,
  });
}
