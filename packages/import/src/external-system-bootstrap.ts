import type { ExternalSystemsImportService } from './external-systems-import.service';
import type { ImportError } from './types';
import { makeImportError } from './types';

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
 * The ImportError an import service records when its external-system bootstrap
 * fails.
 *
 * `messagePrefix` exists only because callers disagree on whether to prefix the
 * message, and at least one spec asserts on a prefixed form. The wording is
 * left to each caller rather than normalised here, so moving this helper cannot
 * silently change any import tool's error text.
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
