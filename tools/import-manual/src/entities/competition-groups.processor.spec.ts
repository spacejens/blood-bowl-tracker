import { CompetitionGroupsImportService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { ManualDataFile } from '../data-file/manual-data-file.schema';
import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';
import { CompetitionGroupsProcessor } from './competition-groups.processor';

function emptyData(): ManualDataFile {
  return {
    externalSystems: [],
    rulesSets: [],
    leagues: [],
    eras: [],
    races: [],
    positions: [],
    positionRulesSets: [],
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
    systemIds: new Map([['Name', 2]]),
    errors: [],
  };
}

describe('CompetitionGroupsProcessor', () => {
  let processor: CompetitionGroupsProcessor;
  let groups: MockProxy<CompetitionGroupsImportService>;
  let refResolver: MockProxy<ReferenceResolverService>;

  beforeEach(async () => {
    groups = mock<CompetitionGroupsImportService>();
    refResolver = mock<ReferenceResolverService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CompetitionGroupsProcessor,
        { provide: CompetitionGroupsImportService, useValue: groups },
        { provide: ReferenceResolverService, useValue: refResolver },
      ],
    }).compile();
    processor = moduleRef.get(CompetitionGroupsProcessor);
  });

  it('upserts each declared group and counts it', async () => {
    refResolver.resolveRef.mockResolvedValue(9);
    refResolver.competitionGroupRef.mockReturnValue({
      system: 'Name',
      id: 'Chaos Cup',
    });
    groups.upsert.mockResolvedValue({
      id: 6,
      name: 'Chaos Cup',
      leagueId: 9,
      createdAt: new Date(),
      created: true,
    });
    const data = emptyData();
    data.competitionGroups = [
      {
        name: 'Chaos Cup',
        league: { system: 'tloeg.bbleague.se', id: 'tLoEG' },
      },
    ];
    const ctx = makeContext(data);

    const count = await processor.process(ctx);

    expect(count).toBe(1);
    expect(groups.upsert).toHaveBeenCalledWith(
      {
        name: 'Chaos Cup',
        leagueId: 9,
        externalIds: [{ externalSystemId: 2, externalId: 'Chaos Cup' }],
      },
      ctx.errors,
    );
    expect(refResolver.resolveRef).toHaveBeenCalledWith(
      expect.objectContaining({
        ref: data.competitionGroups[0].league,
        kind: 'league',
      }),
    );
  });

  it('does nothing and does not require the Name system when there are no groups', async () => {
    const ctx = {
      ...makeContext(emptyData()),
      systemIds: new Map<string, number>(),
    };

    expect(await processor.process(ctx)).toBe(0);
    expect(refResolver.resolveRef).not.toHaveBeenCalled();
  });

  it('throws when the Name external system was not bootstrapped', async () => {
    refResolver.resolveRef.mockResolvedValue(9);
    const data = emptyData();
    data.competitionGroups = [
      {
        name: 'Chaos Cup',
        league: { system: 'tloeg.bbleague.se', id: 'tLoEG' },
      },
    ];
    const ctx = { ...makeContext(data), systemIds: new Map<string, number>() };

    await expect(processor.process(ctx)).rejects.toThrow(/"Name"/);
  });

  it('throws the Name-system error before ever resolving league refs, even when the league would also fail to resolve', async () => {
    // resolveRef is never expected to be called: the Name-system bootstrap
    // check runs before the per-entry loop, so a data file missing the
    // "Name" system declaration surfaces that root cause -- not a confusing
    // "unknown league" error from the first entry whose league also fails to
    // resolve.
    refResolver.resolveRef.mockResolvedValue(undefined);
    const data = emptyData();
    data.competitionGroups = [
      {
        name: 'Chaos Cup',
        league: { system: 'tloeg.bbleague.se', id: 'missing' },
      },
    ];
    const ctx = { ...makeContext(data), systemIds: new Map<string, number>() };

    await expect(processor.process(ctx)).rejects.toThrow(/"Name"/);
    expect(refResolver.resolveRef).not.toHaveBeenCalled();
  });

  it('skips an entry whose league cannot be resolved', async () => {
    refResolver.resolveRef.mockResolvedValue(undefined);
    const data = emptyData();
    data.competitionGroups = [
      {
        name: 'Chaos Cup',
        league: { system: 'tloeg.bbleague.se', id: 'missing' },
      },
    ];
    const ctx = makeContext(data);

    const count = await processor.process(ctx);

    expect(count).toBe(0);
    expect(groups.upsert).not.toHaveBeenCalled();
  });

  it('does not count when the upsert fails', async () => {
    refResolver.resolveRef.mockResolvedValue(9);
    refResolver.competitionGroupRef.mockReturnValue({
      system: 'Name',
      id: 'Chaos Cup',
    });
    groups.upsert.mockResolvedValue(undefined);
    const data = emptyData();
    data.competitionGroups = [
      {
        name: 'Chaos Cup',
        league: { system: 'tloeg.bbleague.se', id: 'tLoEG' },
      },
    ];
    const ctx = makeContext(data);

    expect(await processor.process(ctx)).toBe(0);
  });
});
