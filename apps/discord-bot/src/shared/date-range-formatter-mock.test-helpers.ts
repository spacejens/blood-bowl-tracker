import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { DateRangeFormatterService } from './date-range-formatter.service';

/**
 * Test-only helper. Do not import from production code.
 *
 * A `DateRangeFormatterService` mock canned to fixed values for both
 * `.format()` and `.formatNamed()` — not a copy of the real service's
 * formatting: it proves callers' date suffixes come from the formatter
 * without re-deriving what that service does (which is covered by its own
 * spec, `date-range-formatter.service.spec.ts`). `.formatNamed()` returns a
 * flat literal rather than computing `<name> (<range>)` from its arguments,
 * since building that shape is exactly the logic the real service owns.
 *
 * `namedRange` lets a call site pick the literal `.formatNamed()` returns by
 * default, so it can match that site's own default fixture. Any test that
 * needs a different name or range still overrides this per-test with its own
 * `mockReturnValueOnce`/`mockReturnValue`.
 */
export function makeDateRangeFormatter(
  namedRange = 'BB2020 (2020-01-01 – 2023-12-31)',
): MockProxy<DateRangeFormatterService> {
  const dateRangeFormatter = mock<DateRangeFormatterService>();
  dateRangeFormatter.format.mockReturnValue('2020-01-01 – 2023-12-31');
  dateRangeFormatter.formatNamed.mockReturnValue(namedRange);
  return dateRangeFormatter;
}
