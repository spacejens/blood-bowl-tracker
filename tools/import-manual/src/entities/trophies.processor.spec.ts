import { TrophiesImportService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { ManualDataFile } from '../data-file/manual-data-file.schema';
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

function makeContext(data: ManualDataFile): ProcessContext {
  return {
    data,
    systemIds: new Map([
      ['Name', 2],
      ['tloeg.bbleague.se', 1],
    ]),
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
    refResolver.resolveOptionalRef.mockResolvedValue({
      ok: true,
      id: undefined,
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        TrophiesProcessor,
        { provide: TrophiesImportService, useValue: trophies },
        { provide: ReferenceResolverService, useValue: refResolver },
      ],
    }).compile();
    processor = moduleRef.get(TrophiesProcessor);
  });

  it('upserts a trophy', async () => {
    trophies.upsert.mockResolvedValue({
      id: 31,
      name: 'Chaos Cup',
      recipientKind: 'team',
      description: 'The team that wins after four matches.',
      competitionGroupId: 1,
      leagueId: null,
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
    const ctx = makeContext(data);

    const count = await processor.process(ctx);

    expect(count).toBe(1);
    expect(trophies.upsert).toHaveBeenCalledWith(
      {
        name: 'Chaos Cup',
        recipientKind: 'team',
        description: 'The team that wins after four matches.',
        externalIds: cannedExternalIds,
      },
      ctx.errors,
    );
  });

  it('does not count when the upsert fails', async () => {
    trophies.upsert.mockResolvedValue(undefined);
    refResolver.toExternalIds.mockReturnValue([
      { externalSystemId: 1, externalId: 'name:broken' },
    ]);
    const data = emptyData();
    data.trophies = [
      {
        name: 'Broken',
        recipientKind: 'player',
        externalIds: [{ system: 'Name', id: 'name:broken' }],
      },
    ];

    const count = await processor.process(makeContext(data));

    expect(count).toBe(0);
  });

  it('imports every trophy in the section', async () => {
    trophies.upsert.mockResolvedValue({
      id: 1,
      name: 'Major 1st',
      recipientKind: 'team',
      description: null,
      competitionGroupId: 1,
      leagueId: null,
      createdAt: new Date(),
      created: true,
    });
    refResolver.toExternalIds.mockReturnValue([
      { externalSystemId: 1, externalId: 'Major 1st' },
    ]);
    const data = emptyData();
    data.trophies = [
      {
        name: 'Major 1st',
        recipientKind: 'team',
        externalIds: [{ system: 'tloeg.bbleague.se', id: 'Major 1st' }],
      },
      {
        name: 'Season MVP',
        recipientKind: 'player',
        externalIds: [{ system: 'tloeg.bbleague.se', id: 'Season MVP' }],
      },
    ];

    const count = await processor.process(makeContext(data));

    expect(count).toBe(2);
  });

  it('resolves the named competition group into the upsert payload', async () => {
    const groupRef = { system: 'Name', id: 'Major Season' };
    refResolver.resolveOptionalRef.mockResolvedValue({ ok: true, id: 4 });
    trophies.upsert.mockResolvedValue({
      id: 8,
      name: 'Major Gold',
      recipientKind: 'team',
      description: null,
      competitionGroupId: 4,
      leagueId: null,
      createdAt: new Date(),
      created: true,
    });
    refResolver.toExternalIds.mockReturnValue([
      { externalSystemId: 1, externalId: 'Major Gold' },
    ]);
    const data = emptyData();
    data.trophies = [
      {
        name: 'Major Gold',
        recipientKind: 'team',
        externalIds: [{ system: 'tloeg.bbleague.se', id: 'Major Gold' }],
        competitionGroup: groupRef,
      },
    ];
    const ctx = makeContext(data);

    expect(await processor.process(ctx)).toBe(1);
    expect(refResolver.resolveOptionalRef).toHaveBeenCalledWith(
      expect.objectContaining({
        ref: groupRef,
        systemIds: ctx.systemIds,
        kind: 'competitionGroup',
      }),
    );
    expect(trophies.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ competitionGroupId: 4 }),
      ctx.errors,
    );
  });

  it('passes no group ref through for a trophy that names none', async () => {
    trophies.upsert.mockResolvedValue({
      id: 9,
      name: 'Ungrouped',
      recipientKind: 'team',
      description: null,
      competitionGroupId: 1,
      leagueId: null,
      createdAt: new Date(),
      created: true,
    });
    refResolver.toExternalIds.mockReturnValue([
      { externalSystemId: 1, externalId: 'Ungrouped' },
    ]);
    const data = emptyData();
    data.trophies = [
      {
        name: 'Ungrouped',
        recipientKind: 'team',
        externalIds: [{ system: 'tloeg.bbleague.se', id: 'Ungrouped' }],
      },
    ];

    expect(await processor.process(makeContext(data))).toBe(1);
    expect(refResolver.resolveOptionalRef).toHaveBeenCalledWith(
      expect.objectContaining({ ref: undefined, kind: 'competitionGroup' }),
    );
    expect(trophies.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ competitionGroupId: undefined }),
      expect.anything(),
    );
  });

  it('skips a trophy whose competition group cannot be resolved', async () => {
    refResolver.resolveOptionalRef.mockResolvedValue({ ok: false });
    const data = emptyData();
    data.trophies = [
      {
        name: 'Major Gold',
        recipientKind: 'team',
        externalIds: [{ system: 'tloeg.bbleague.se', id: 'Major Gold' }],
        competitionGroup: { system: 'Name', id: 'Nonexistent' },
      },
    ];

    expect(await processor.process(makeContext(data))).toBe(0);
    expect(trophies.upsert).not.toHaveBeenCalled();
  });

  it('resolves a league reference and passes its id to the upsert', async () => {
    refResolver.resolveOptionalRef.mockImplementation((options) =>
      Promise.resolve(
        options.kind === 'league'
          ? { ok: true, id: 7 }
          : { ok: true, id: undefined },
      ),
    );
    trophies.upsert.mockResolvedValue({
      id: 3,
      name: 'Legendary Player',
      recipientKind: 'player',
      description: null,
      competitionGroupId: 1,
      leagueId: 7,
      createdAt: new Date(),
      created: true,
    });

    const imported = await processor.process(
      makeContext({
        ...emptyData(),
        trophies: [
          {
            name: 'Legendary Player',
            recipientKind: 'player',
            league: { system: 'tloeg.bbleague.se', id: 'tLoEG' },
            externalIds: [
              { system: 'tloeg.bbleague.se', id: 'Legendary Player' },
            ],
          },
        ],
      }),
    );

    expect(imported).toBe(1);
    expect(trophies.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ competitionGroupId: undefined, leagueId: 7 }),
      expect.anything(),
    );
  });

  it('skips an entry whose league reference does not resolve', async () => {
    refResolver.resolveOptionalRef.mockImplementation((options) =>
      Promise.resolve(
        options.kind === 'league' ? { ok: false } : { ok: true, id: undefined },
      ),
    );

    const imported = await processor.process(
      makeContext({
        ...emptyData(),
        trophies: [
          {
            name: 'Legendary Player',
            recipientKind: 'player',
            league: { system: 'tloeg.bbleague.se', id: 'nope' },
            externalIds: [
              { system: 'tloeg.bbleague.se', id: 'Legendary Player' },
            ],
          },
        ],
      }),
    );

    expect(imported).toBe(0);
    expect(trophies.upsert).not.toHaveBeenCalled();
  });

  it('passes both scope ids through undefined when an entry names neither', async () => {
    // Neither-set and both-set are authoring errors the database's own check
    // constraint catches at write time; the processor adds no validation of
    // its own and simply forwards what it resolved.
    refResolver.resolveOptionalRef.mockResolvedValue({
      ok: true,
      id: undefined,
    });
    trophies.upsert.mockResolvedValue({
      id: 3,
      name: 'Orphan',
      recipientKind: 'team',
      description: null,
      competitionGroupId: 1,
      leagueId: null,
      createdAt: new Date(),
      created: true,
    });

    await processor.process(
      makeContext({
        ...emptyData(),
        trophies: [
          {
            name: 'Orphan',
            recipientKind: 'team',
            externalIds: [{ system: 'tloeg.bbleague.se', id: 'Orphan' }],
          },
        ],
      }),
    );

    expect(trophies.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        competitionGroupId: undefined,
        leagueId: undefined,
      }),
      expect.anything(),
    );
  });
});
