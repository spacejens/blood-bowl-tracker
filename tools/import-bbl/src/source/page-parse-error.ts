import type { ImportError } from '@blood-bowl-tracker/import';
import { makeImportError } from '@blood-bowl-tracker/import';

/**
 * The ImportError every page-scanning import records when a page throws while
 * being parsed. `pageDescription` names the kind of page ("position", "team",
 * "match list") and is the only part that varies.
 */
export function pageParseError(
  pageParams: unknown,
  pageDescription: string,
  error: unknown,
): ImportError {
  return makeImportError({
    item: { page: pageParams },
    message: `Failed to parse ${pageDescription} page ${JSON.stringify(pageParams)}: ${
      error instanceof Error ? error.message : String(error)
    }`,
  });
}
