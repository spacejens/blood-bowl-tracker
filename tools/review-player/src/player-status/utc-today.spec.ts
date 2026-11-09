import { PgDialect, type SQL } from '@blood-bowl-tracker/db/test-helpers';
import { describe, expect, it } from 'vitest';

import { UTC_TODAY } from './utc-today';

describe('UTC_TODAY', () => {
  it("renders today's date in UTC, independent of the session timezone", () => {
    const query = new PgDialect().sqlToQuery(UTC_TODAY as unknown as SQL);

    expect(query.sql).toBe("(now() at time zone 'UTC')::date");
    expect(query.sql).not.toContain('current_date');
    expect(query.params).toEqual([]);
  });
});
