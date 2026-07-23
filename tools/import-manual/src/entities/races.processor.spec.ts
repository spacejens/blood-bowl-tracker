import type {
  ImportError,
  RacesImportService,
} from '@blood-bowl-tracker/import';
import { ImportResultService } from '@blood-bowl-tracker/import';
import { describe, expect, it, vi } from 'vitest';

import type { ManualDataFile } from '../data-file/manual-data-file.schema';
import { ExternalIdMap } from '../references/external-id-map';
import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';
import { RacesProcessor } from './races.processor';

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

function makeContext(
  data: ManualDataFile,
  idMap: ExternalIdMap,
): ProcessContext {
  return {
    data,
    systemIds: new Map([
      ['Name', 2],
      ['BBL', 1],
    ]),
    idMap,
    errors: [] as ImportError[],
  };
}

describe('RacesProcessor', () => {
  it('resolves era refs, upserts, and records ids', async () => {
    const upsertRace = vi.fn().mockResolvedValue({ id: 40 });
    const processor = new RacesProcessor(
      {
        upsertRace,
      } as unknown as RacesImportService,
      makeRefResolver(),
    );
    const idMap = new ExternalIdMap();
    idMap.add([{ system: 'Name', id: 'name:season-12' }], 50);
    const data = emptyData();
    data.races = [
      {
        name: 'Necromantic Horror',
        eras: [{ system: 'Name', id: 'name:season-12' }],
        externalIds: [
          { system: 'BBL', id: 'id:47' },
          { system: 'Name', id: 'name:necromantic-horror' },
        ],
      },
    ];
    const ctx = makeContext(data, idMap);

    const count = await processor.process(ctx);

    expect(count).toBe(1);
    expect(upsertRace).toHaveBeenCalledWith(
      {
        name: 'Necromantic Horror',
        eras: [50],
        externalIds: [
          { externalSystemId: 1, externalId: 'id:47' },
          { externalSystemId: 2, externalId: 'name:necromantic-horror' },
        ],
      },
      ctx.errors,
    );
    expect(ctx.idMap.resolve({ system: 'BBL', id: 'id:47' })).toBe(40);
  });

  it('upserts a race with no eras (empty list)', async () => {
    const upsertRace = vi.fn().mockResolvedValue({ id: 41 });
    const processor = new RacesProcessor(
      {
        upsertRace,
      } as unknown as RacesImportService,
      makeRefResolver(),
    );
    const data = emptyData();
    data.races = [
      {
        name: 'Amazon',
        eras: [],
        externalIds: [{ system: 'Name', id: 'name:amazon' }],
      },
    ];

    const count = await processor.process(
      makeContext(data, new ExternalIdMap()),
    );

    expect(count).toBe(1);
    expect(upsertRace.mock.calls[0][0]).toMatchObject({ eras: [] });
  });

  it('skips the race and records an error when an era ref is unresolved', async () => {
    const upsertRace = vi.fn();
    const processor = new RacesProcessor(
      {
        upsertRace,
      } as unknown as RacesImportService,
      makeRefResolver(),
    );
    const data = emptyData();
    data.races = [
      {
        name: 'Orphan',
        eras: [{ system: 'Name', id: 'name:missing' }],
        externalIds: [{ system: 'Name', id: 'name:orphan' }],
      },
    ];
    const ctx = makeContext(data, new ExternalIdMap());

    const count = await processor.process(ctx);

    expect(count).toBe(0);
    expect(upsertRace).not.toHaveBeenCalled();
    expect(ctx.errors).toHaveLength(1);
  });

  it('does not record ids when upsert returns null', async () => {
    const upsertRace = vi.fn().mockResolvedValue(null);
    const processor = new RacesProcessor(
      {
        upsertRace,
      } as unknown as RacesImportService,
      makeRefResolver(),
    );
    const idMap = new ExternalIdMap();
    const data = emptyData();
    data.races = [
      {
        name: 'NullRace',
        eras: [],
        externalIds: [{ system: 'Name', id: 'name:null-race' }],
      },
    ];

    const count = await processor.process(makeContext(data, idMap));

    expect(count).toBe(0);
    expect(
      idMap.resolve({ system: 'Name', id: 'name:null-race' }),
    ).toBeUndefined();
  });
});
