import { LeaguesImportService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { ManualDataFile } from '../data-file/manual-data-file.schema';
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

  it('upserts each league and counts it', async () => {
    leagues.upsert.mockResolvedValue({
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
    expect(leagues.upsert).toHaveBeenCalledWith(
      { name: 'My League', externalIds: cannedExternalIds },
      ctx.errors,
    );
  });

  it('does not count when the upsert fails', async () => {
    leagues.upsert.mockResolvedValue(undefined);
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
  });
});
