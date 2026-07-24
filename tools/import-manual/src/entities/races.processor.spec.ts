import { RacesImportService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { ManualDataFile } from '../data-file/manual-data-file.schema';
import { ExternalIdMap } from '../references/external-id-map';
import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';
import { RacesProcessor } from './races.processor';
import { mockReferenceResolver } from './reference-resolver-mock.test-helpers';

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
    errors: [],
  };
}

describe('RacesProcessor', () => {
  let processor: RacesProcessor;
  let races: MockProxy<RacesImportService>;
  let refResolver: MockProxy<ReferenceResolverService>;

  beforeEach(async () => {
    races = mock<RacesImportService>();
    refResolver = mockReferenceResolver();
    const moduleRef = await Test.createTestingModule({
      providers: [
        RacesProcessor,
        { provide: RacesImportService, useValue: races },
        { provide: ReferenceResolverService, useValue: refResolver },
      ],
    }).compile();
    processor = moduleRef.get(RacesProcessor);
  });

  it('resolves era refs, upserts, and records ids', async () => {
    races.upsertRace.mockResolvedValue({
      id: 40,
      name: 'Necromantic Horror',
      eras: [50],
      createdAt: new Date(),
      created: true,
    });
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
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(races.upsertRace).toHaveBeenCalledWith(
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
    races.upsertRace.mockResolvedValue({
      id: 41,
      name: 'Amazon',
      eras: [],
      createdAt: new Date(),
      created: true,
    });
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
    expect(races.upsertRace.mock.calls[0][0]).toMatchObject({ eras: [] });
  });

  it('skips the race and records an error when an era ref is unresolved', async () => {
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
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(races.upsertRace).not.toHaveBeenCalled();
    expect(ctx.errors).toHaveLength(1);
  });

  it('does not record ids when upsert returns null', async () => {
    races.upsertRace.mockResolvedValue(
      null as unknown as Awaited<ReturnType<RacesImportService['upsertRace']>>,
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
