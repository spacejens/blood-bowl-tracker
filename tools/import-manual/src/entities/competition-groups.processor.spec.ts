import { CompetitionGroupsImportService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { ManualDataFile } from '../data-file/manual-data-file.schema';
import { ExternalIdMap } from '../references/external-id-map';
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
    idMap: new ExternalIdMap(),
    competitionGroupIds: new Map(),
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
    groups.listCompetitionGroups.mockResolvedValue([]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        CompetitionGroupsProcessor,
        { provide: CompetitionGroupsImportService, useValue: groups },
        { provide: ReferenceResolverService, useValue: refResolver },
      ],
    }).compile();
    processor = moduleRef.get(CompetitionGroupsProcessor);
  });

  it('seeds the name map from groups that already exist in the database', async () => {
    groups.listCompetitionGroups.mockResolvedValue([
      { id: 4, name: 'Major Season' },
    ]);
    const ctx = makeContext(emptyData());

    const count = await processor.process(ctx);

    expect(count).toBe(0);
    expect(ctx.competitionGroupIds.get('Major Season')).toBe(4);
  });

  it('upserts each declared group, records its id, and counts it', async () => {
    refResolver.resolveRef.mockReturnValue(9);
    groups.upsertCompetitionGroup.mockResolvedValue({
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
    expect(groups.upsertCompetitionGroup).toHaveBeenCalledWith(
      { name: 'Chaos Cup', leagueId: 9 },
      ctx.errors,
    );
    expect(ctx.competitionGroupIds.get('Chaos Cup')).toBe(6);
  });

  it('skips an entry whose league cannot be resolved', async () => {
    refResolver.resolveRef.mockReturnValue(undefined);
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
    expect(groups.upsertCompetitionGroup).not.toHaveBeenCalled();
    expect(ctx.competitionGroupIds.has('Chaos Cup')).toBe(false);
  });

  it('does not record an id or count when the upsert fails', async () => {
    refResolver.resolveRef.mockReturnValue(9);
    groups.upsertCompetitionGroup.mockResolvedValue(undefined);
    const data = emptyData();
    data.competitionGroups = [
      {
        name: 'Chaos Cup',
        league: { system: 'tloeg.bbleague.se', id: 'tLoEG' },
      },
    ];
    const ctx = makeContext(data);

    expect(await processor.process(ctx)).toBe(0);
    expect(ctx.competitionGroupIds.has('Chaos Cup')).toBe(false);
  });
});
