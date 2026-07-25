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
    refResolver = mock<ReferenceResolverService>();
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
    refResolver.resolveRefs.mockReturnValue([50]);
    const cannedExternalIds = [
      { externalSystemId: 98, externalId: 'canned:bbl-47' },
      { externalSystemId: 99, externalId: 'canned:necromantic-horror' },
    ];
    refResolver.toExternalIds.mockReturnValue(cannedExternalIds);
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
    const ctx = makeContext(data, new ExternalIdMap());

    const count = await processor.process(ctx);

    expect(count).toBe(1);
    expect(refResolver.resolveRefs).toHaveBeenCalledWith(
      expect.objectContaining({ refs: data.races[0].eras }),
    );
    expect(races.upsertRace).toHaveBeenCalledWith(
      {
        name: 'Necromantic Horror',
        eras: [50],
        externalIds: cannedExternalIds,
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
    refResolver.resolveRefs.mockReturnValue([]);
    refResolver.toExternalIds.mockReturnValue([]);
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

  // Resolution-failure error counting is the resolver's own behaviour and is
  // covered by reference-resolver.service.spec.ts. This test instead asserts
  // the processor's own logic: it must skip the entry (no upsert) and never
  // reach toExternalIds when the era refs fail to resolve.
  it('skips the race and never upserts when an era ref is unresolved', async () => {
    refResolver.resolveRefs.mockReturnValue(undefined);
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
    expect(races.upsertRace).not.toHaveBeenCalled();
    expect(refResolver.toExternalIds).not.toHaveBeenCalled();
  });

  it('does not record ids when upsert returns null', async () => {
    races.upsertRace.mockResolvedValue(
      null as unknown as Awaited<ReturnType<RacesImportService['upsertRace']>>,
    );
    refResolver.resolveRefs.mockReturnValue([]);
    refResolver.toExternalIds.mockReturnValue([]);
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
