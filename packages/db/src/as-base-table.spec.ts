import { describe, expect, it } from 'vitest';

import { asBaseTable } from './as-base-table';
import * as db from './index';
import { guilds } from './schema';

describe('asBaseTable', () => {
  it('returns the very same table object', () => {
    expect(asBaseTable(guilds)).toBe(guilds);
  });

  it('is re-exported from the package entry point', () => {
    expect(db.asBaseTable).toBe(asBaseTable);
  });
});
