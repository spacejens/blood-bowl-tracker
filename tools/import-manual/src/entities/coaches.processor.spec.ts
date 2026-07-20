import type { CoachesImportService, ImportError } from '@blood-bowl-tracker/import';
import { describe, expect, it, vi } from 'vitest';

import type { ManualDataFile } from '../data-file/manual-data-file.schema';
import { ExternalIdMap } from '../references/external-id-map';
import type { ProcessContext } from '../references/process-context';
import { CoachesProcessor } from './coaches.processor';

function emptyData(): ManualDataFile {
  return {
    externalSystems: [],
    rulesSets: [],
    leagues: [],
    eras: [],
    races: [],
    positions: [],
    coaches: [],
    teams: [],
  };
}

function makeContext(data: ManualDataFile): ProcessContext {
  return {
    data,
    systemIds: new Map([['Name', 2]]),
    idMap: new ExternalIdMap(),
    errors: [] as ImportError[],
  };
}

describe('CoachesProcessor', () => {
  it('upserts each coach, records its external ids, and counts it', async () => {
    const upsertCoach = vi.fn().mockResolvedValue({ id: 12 });
    const processor = new CoachesProcessor({
      upsertCoach,
    } as unknown as CoachesImportService);
    const data = emptyData();
    data.coaches = [
      { name: 'Bob', externalIds: [{ system: 'Name', id: 'name:bob' }] },
    ];
    const ctx = makeContext(data);

    const count = await processor.process(ctx);

    expect(count).toBe(1);
    expect(upsertCoach).toHaveBeenCalledWith(
      {
        name: 'Bob',
        externalIds: [{ externalSystemId: 2, externalId: 'name:bob' }],
      },
      ctx.errors,
    );
    expect(ctx.idMap.resolve({ system: 'Name', id: 'name:bob' })).toBe(12);
  });

  it('does not record ids or count when the upsert fails', async () => {
    const upsertCoach = vi.fn().mockResolvedValue(undefined);
    const processor = new CoachesProcessor({
      upsertCoach,
    } as unknown as CoachesImportService);
    const data = emptyData();
    data.coaches = [
      { name: 'Bob', externalIds: [{ system: 'Name', id: 'name:bob' }] },
    ];
    const ctx = makeContext(data);

    const count = await processor.process(ctx);

    expect(count).toBe(0);
    expect(ctx.idMap.resolve({ system: 'Name', id: 'name:bob' })).toBeUndefined();
  });
});
