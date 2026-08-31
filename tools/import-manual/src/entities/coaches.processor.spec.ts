import { CoachesImportService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { ManualDataFile } from '../data-file/manual-data-file.schema';
import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';
import { CoachesProcessor } from './coaches.processor';

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
    errors: [],
  };
}

describe('CoachesProcessor', () => {
  let processor: CoachesProcessor;
  let coaches: MockProxy<CoachesImportService>;
  let refResolver: MockProxy<ReferenceResolverService>;

  beforeEach(async () => {
    coaches = mock<CoachesImportService>();
    refResolver = mock<ReferenceResolverService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CoachesProcessor,
        { provide: CoachesImportService, useValue: coaches },
        { provide: ReferenceResolverService, useValue: refResolver },
      ],
    }).compile();
    processor = moduleRef.get(CoachesProcessor);
  });

  it('upserts each coach and counts it', async () => {
    coaches.upsert.mockResolvedValue({
      id: 12,
      name: 'Bob',
      createdAt: new Date(),
      created: true,
    });
    const cannedExternalIds = [
      { externalSystemId: 99, externalId: 'canned:bob' },
    ];
    refResolver.toExternalIds.mockReturnValue(cannedExternalIds);
    const data = emptyData();
    data.coaches = [
      { name: 'Bob', externalIds: [{ system: 'Name', id: 'name:bob' }] },
    ];
    const ctx = makeContext(data);

    const count = await processor.process(ctx);

    expect(count).toBe(1);
    expect(refResolver.toExternalIds).toHaveBeenCalledWith(
      data.coaches[0].externalIds,
      ctx.systemIds,
    );
    expect(coaches.upsert).toHaveBeenCalledWith(
      { name: 'Bob', externalIds: cannedExternalIds },
      ctx.errors,
    );
  });

  it('does not count when the upsert fails', async () => {
    coaches.upsert.mockResolvedValue(undefined);
    const data = emptyData();
    data.coaches = [
      { name: 'Bob', externalIds: [{ system: 'Name', id: 'name:bob' }] },
    ];
    const ctx = makeContext(data);

    const count = await processor.process(ctx);

    expect(count).toBe(0);
  });
});
