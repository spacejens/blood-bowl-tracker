import { LeaguesImportService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { ManualDataFile } from '../data-file/manual-data-file.schema';
import { ExternalIdMap } from '../references/external-id-map';
import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';
import { LeaguesProcessor } from './leagues.processor';

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

describe('LeaguesProcessor', () => {
  let processor: LeaguesProcessor;
  let leagues: MockProxy<LeaguesImportService>;
  let refResolver: MockProxy<ReferenceResolverService>;

  beforeEach(async () => {
    leagues = mock<LeaguesImportService>();
    refResolver = mock<ReferenceResolverService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        LeaguesProcessor,
        { provide: LeaguesImportService, useValue: leagues },
        { provide: ReferenceResolverService, useValue: refResolver },
      ],
    }).compile();
    processor = moduleRef.get(LeaguesProcessor);
  });

  it('upserts each league, records its external ids, and counts it', async () => {
    leagues.upsertLeague.mockResolvedValue({
      id: 3,
      name: 'My League',
      createdAt: new Date(),
      created: true,
    });
    const cannedExternalIds = [
      { externalSystemId: 99, externalId: 'canned:my-league' },
    ];
    refResolver.toExternalIds.mockReturnValue(cannedExternalIds);
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
    expect(refResolver.toExternalIds).toHaveBeenCalledWith(
      data.leagues[0].externalIds,
      ctx.systemIds,
    );
    expect(leagues.upsertLeague).toHaveBeenCalledWith(
      { name: 'My League', externalIds: cannedExternalIds },
      ctx.errors,
    );
    expect(ctx.idMap.resolve({ system: 'Name', id: 'name:my-league' })).toBe(3);
  });

  it('does not record ids or count when the upsert fails', async () => {
    leagues.upsertLeague.mockResolvedValue(undefined);
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
