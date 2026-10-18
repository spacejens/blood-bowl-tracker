import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { historyRegistry } from '../history';
import { manualImportBatches, manualImportBatchesHistory } from '../index';

describe('manual_import_batches', () => {
  it('lives in game_data with a unique, required name', () => {
    const config = getTableConfig(manualImportBatches);
    expect(config.name).toBe('manual_import_batches');
    expect(config.schema).toBe('game_data');
    const byName = new Map(config.columns.map((c) => [c.name, c]));
    expect(byName.get('name')?.notNull).toBe(true);
    expect(byName.get('name')?.isUnique).toBe(true);
    expect(byName.get('content_hash')?.notNull).toBe(true);
    expect(byName.get('applied_at')?.notNull).toBe(true);
    expect(byName.get('applied_at')?.hasDefault).toBe(true);
  });

  it('is history-tracked like every other table', () => {
    expect(
      historyRegistry.some(
        (entry) => entry.tableName === 'manual_import_batches',
      ),
    ).toBe(true);
    expect(getTableConfig(manualImportBatchesHistory).name).toBe(
      'manual_import_batches_history',
    );
  });
});
