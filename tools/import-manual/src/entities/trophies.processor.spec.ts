import { TrophiesImportService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { ManualDataFile } from '../data-file/manual-data-file.schema';
import { ExternalIdMap } from '../references/external-id-map';
import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';
import { TrophiesProcessor } from './trophies.processor';

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
    competitions: [],
    sppAwardValues: [],
    trophies: [],
    competitionGroups: [],
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
      ['tloeg.bbleague.se', 1],
    ]),
    idMap,
    errors: [],
  };
}

describe('TrophiesProcessor', () => {
  let processor: TrophiesProcessor;
  let trophies: MockProxy<TrophiesImportService>;
  let refResolver: MockProxy<ReferenceResolverService>;

  beforeEach(async () => {
    trophies = mock<TrophiesImportService>();
    refResolver = mock<ReferenceResolverService>();
    refResolver.resolveOptionalRef.mockReturnValue({ ok: true, id: undefined });
    const moduleRef = await Test.createTestingModule({
      providers: [
        TrophiesProcessor,
        { provide: TrophiesImportService, useValue: trophies },
        { provide: ReferenceResolverService, useValue: refResolver },
      ],
    }).compile();
    processor = moduleRef.get(TrophiesProcessor);
  });

  it('upserts a trophy and records its id', async () => {
    trophies.upsertTrophy.mockResolvedValue({
      id: 31,
      name: 'Chaos Cup',
      recipientKind: 'team',
      description: 'The team that wins after four matches.',
      competitionGroupId: 1,
      createdAt: new Date(),
      created: true,
    });
    const cannedExternalIds = [
      { externalSystemId: 1, externalId: 'Chaos Cup' },
    ];
    refResolver.toExternalIds.mockReturnValue(cannedExternalIds);
    const data = emptyData();
    data.trophies = [
      {
        name: 'Chaos Cup',
        recipientKind: 'team',
        description: 'The team that wins after four matches.',
        externalIds: [{ system: 'tloeg.bbleague.se', id: 'Chaos Cup' }],
      },
    ];
    const ctx = makeContext(data, new ExternalIdMap());

    const count = await processor.process(ctx);

    expect(count).toBe(1);
    expect(trophies.upsertTrophy).toHaveBeenCalledWith(
      {
        name: 'Chaos Cup',
        recipientKind: 'team',
        description: 'The team that wins after four matches.',
        externalIds: cannedExternalIds,
      },
      ctx.errors,
    );
    expect(
      ctx.idMap.resolve({ system: 'tloeg.bbleague.se', id: 'Chaos Cup' }),
    ).toBe(31);
  });

  it('upserts a trophy that declares no external ids', async () => {
    trophies.upsertTrophy.mockResolvedValue({
      id: 32,
      name: 'Ogretoberfest',
      recipientKind: 'team',
      description: null,
      competitionGroupId: 1,
      createdAt: new Date(),
      created: true,
    });
    refResolver.toExternalIds.mockReturnValue([]);
    const data = emptyData();
    data.trophies = [
      { name: 'Ogretoberfest', recipientKind: 'team', externalIds: [] },
    ];

    const count = await processor.process(
      makeContext(data, new ExternalIdMap()),
    );

    expect(count).toBe(1);
    expect(trophies.upsertTrophy.mock.calls[0][0]).toEqual({
      name: 'Ogretoberfest',
      recipientKind: 'team',
      description: undefined,
      externalIds: [],
    });
  });

  it('does not record an id when the upsert fails', async () => {
    trophies.upsertTrophy.mockResolvedValue(undefined);
    refResolver.toExternalIds.mockReturnValue([]);
    const idMap = new ExternalIdMap();
    const data = emptyData();
    data.trophies = [
      {
        name: 'Broken',
        recipientKind: 'player',
        externalIds: [{ system: 'Name', id: 'name:broken' }],
      },
    ];

    const count = await processor.process(makeContext(data, idMap));

    expect(count).toBe(0);
    expect(
      idMap.resolve({ system: 'Name', id: 'name:broken' }),
    ).toBeUndefined();
  });

  it('imports every trophy in the section', async () => {
    trophies.upsertTrophy.mockResolvedValue({
      id: 1,
      name: 'Major 1st',
      recipientKind: 'team',
      description: null,
      competitionGroupId: 1,
      createdAt: new Date(),
      created: true,
    });
    refResolver.toExternalIds.mockReturnValue([]);
    const data = emptyData();
    data.trophies = [
      { name: 'Major 1st', recipientKind: 'team', externalIds: [] },
      { name: 'Season MVP', recipientKind: 'player', externalIds: [] },
    ];

    const count = await processor.process(
      makeContext(data, new ExternalIdMap()),
    );

    expect(count).toBe(2);
  });

  it('resolves the named competition group into the upsert payload', async () => {
    const groupRef = { system: 'Name', id: 'Major Season' };
    refResolver.competitionGroupRef.mockReturnValue(groupRef);
    refResolver.resolveOptionalRef.mockReturnValue({ ok: true, id: 4 });
    trophies.upsertTrophy.mockResolvedValue({ id: 8 });
    refResolver.toExternalIds.mockReturnValue([]);
    const data = emptyData();
    data.trophies = [
      {
        name: 'Major Gold',
        recipientKind: 'team',
        externalIds: [],
        competitionGroup: 'Major Season',
      },
    ];
    const ctx = makeContext(data, new ExternalIdMap());

    expect(await processor.process(ctx)).toBe(1);
    expect(refResolver.competitionGroupRef).toHaveBeenCalledWith(
      'Major Season',
    );
    expect(refResolver.resolveOptionalRef).toHaveBeenCalledWith(
      expect.objectContaining({ ref: groupRef, idMap: ctx.idMap }),
    );
    expect(trophies.upsertTrophy).toHaveBeenCalledWith(
      expect.objectContaining({ competitionGroupId: 4 }),
      ctx.errors,
    );
  });

  it('passes no group ref through for a trophy that names none', async () => {
    trophies.upsertTrophy.mockResolvedValue({ id: 9 });
    refResolver.toExternalIds.mockReturnValue([]);
    const data = emptyData();
    data.trophies = [
      { name: 'Ungrouped', recipientKind: 'team', externalIds: [] },
    ];

    expect(
      await processor.process(makeContext(data, new ExternalIdMap())),
    ).toBe(1);
    expect(refResolver.competitionGroupRef).not.toHaveBeenCalled();
    expect(refResolver.resolveOptionalRef).toHaveBeenCalledWith(
      expect.objectContaining({ ref: undefined }),
    );
  });

  it('skips a trophy whose competition group cannot be resolved', async () => {
    refResolver.resolveOptionalRef.mockReturnValue({ ok: false });
    const data = emptyData();
    data.trophies = [
      {
        name: 'Major Gold',
        recipientKind: 'team',
        externalIds: [],
        competitionGroup: 'Nonexistent',
      },
    ];

    expect(
      await processor.process(makeContext(data, new ExternalIdMap())),
    ).toBe(0);
    expect(trophies.upsertTrophy).not.toHaveBeenCalled();
  });
});
