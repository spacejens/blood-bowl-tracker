import type {
  ImportError,
  LeaguesImportService,
} from '@blood-bowl-tracker/import';
import { ImportResultService } from '@blood-bowl-tracker/import';
import { describe, expect, it, vi } from 'vitest';

import type { ManualDataFile } from '../data-file/manual-data-file.schema';
import { ExternalIdMap } from '../references/external-id-map';
import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';
import { LeaguesProcessor } from './leagues.processor';

function makeRefResolver(): ReferenceResolverService {
  return new ReferenceResolverService(new ImportResultService());
}

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

describe('LeaguesProcessor', () => {
  it('upserts each league, records its external ids, and counts it', async () => {
    const upsertLeague = vi.fn().mockResolvedValue({ id: 3 });
    const processor = new LeaguesProcessor(
      {
        upsertLeague,
      } as unknown as LeaguesImportService,
      makeRefResolver(),
    );
    const data = emptyData();
    data.leagues = [
      {
        name: 'My League',
        externalIds: [{ system: 'Name', id: 'name:my-league' }],
      },
    ];
    const ctx = makeContext(data);

    const count = await processor.process(ctx);

    expect(count).toBe(1);
    expect(upsertLeague).toHaveBeenCalledWith(
      {
        name: 'My League',
        externalIds: [{ externalSystemId: 2, externalId: 'name:my-league' }],
      },
      ctx.errors,
    );
    expect(ctx.idMap.resolve({ system: 'Name', id: 'name:my-league' })).toBe(3);
  });

  it('does not record ids or count when the upsert fails', async () => {
    const upsertLeague = vi.fn().mockResolvedValue(undefined);
    const processor = new LeaguesProcessor(
      {
        upsertLeague,
      } as unknown as LeaguesImportService,
      makeRefResolver(),
    );
    const data = emptyData();
    data.leagues = [
      {
        name: 'My League',
        externalIds: [{ system: 'Name', id: 'name:my-league' }],
      },
    ];
    const ctx = makeContext(data);

    const count = await processor.process(ctx);

    expect(count).toBe(0);
    expect(
      ctx.idMap.resolve({ system: 'Name', id: 'name:my-league' }),
    ).toBeUndefined();
  });
});
