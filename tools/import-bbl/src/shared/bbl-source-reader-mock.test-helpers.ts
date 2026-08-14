import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { BblPage } from '../source/bbl-page.types';
import { BblSourceReader } from '../source/bbl-source-reader';

/**
 * Test-only helper. Do not import from production code.
 *
 * A BblSourceReader mock whose pages() yields the given fake pages, whatever
 * page `type` is requested. Each call returns a fresh generator, so a spec may
 * iterate the reader more than once.
 */
export function mockBblSourceReader(
  pages: BblPage[],
): MockProxy<BblSourceReader> {
  const reader = mock<BblSourceReader>();
  // eslint-disable-next-line @typescript-eslint/require-await -- async generator with no await, required to satisfy AsyncIterable
  reader.pages.mockImplementation(async function* () {
    for (const page of pages) {
      yield page;
    }
  });
  return reader;
}

/**
 * Test-only helper. Do not import from production code.
 *
 * A BblSourceReader mock whose pages(type) yields only the fake pages
 * registered for that page type, and nothing for any other type.
 */
export function mockBblSourceReaderByType(
  pagesByType: Record<string, BblPage[]>,
): MockProxy<BblSourceReader> {
  const reader = mock<BblSourceReader>();
  // eslint-disable-next-line @typescript-eslint/require-await -- async generator with no await, required to satisfy AsyncIterable
  reader.pages.mockImplementation(async function* (type: string) {
    for (const page of pagesByType[type] ?? []) {
      yield page;
    }
  });
  return reader;
}
