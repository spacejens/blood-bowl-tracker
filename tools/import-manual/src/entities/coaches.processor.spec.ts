import { CoachesImportService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { ManualDataFile } from '../data-file/manual-data-file.schema';
import { ExternalIdMap } from '../references/external-id-map';
import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';
import { CoachesProcessor } from './coaches.processor';
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

function makeContext(data: ManualDataFile): ProcessContext {
  return {
    data,
    systemIds: new Map([['Name', 2]]),
    idMap: new ExternalIdMap(),
    errors: [],
  };
}

describe('CoachesProcessor', () => {
  let processor: CoachesProcessor;
  let coaches: MockProxy<CoachesImportService>;
  let refResolver: MockProxy<ReferenceResolverService>;

  beforeEach(async () => {
    coaches = mock<CoachesImportService>();
    refResolver = mockReferenceResolver();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CoachesProcessor,
        { provide: CoachesImportService, useValue: coaches },
        { provide: ReferenceResolverService, useValue: refResolver },
      ],
    }).compile();
    processor = moduleRef.get(CoachesProcessor);
  });

  it('upserts each coach, records its external ids, and counts it', async () => {
    coaches.upsertCoach.mockResolvedValue({
      id: 12,
      name: 'Bob',
      createdAt: new Date(),
      created: true,
    });
    const data = emptyData();
    data.coaches = [
      { name: 'Bob', externalIds: [{ system: 'Name', id: 'name:bob' }] },
    ];
    const ctx = makeContext(data);

    const count = await processor.process(ctx);

    expect(count).toBe(1);
    expect(coaches.upsertCoach).toHaveBeenCalledWith(
      {
        name: 'Bob',
        externalIds: [{ externalSystemId: 2, externalId: 'name:bob' }],
      },
      ctx.errors,
    );
    expect(ctx.idMap.resolve({ system: 'Name', id: 'name:bob' })).toBe(12);
  });

  it('does not record ids or count when the upsert fails', async () => {
    coaches.upsertCoach.mockResolvedValue(undefined);
    const data = emptyData();
    data.coaches = [
      { name: 'Bob', externalIds: [{ system: 'Name', id: 'name:bob' }] },
    ];
    const ctx = makeContext(data);

    const count = await processor.process(ctx);

    expect(count).toBe(0);
    expect(
      ctx.idMap.resolve({ system: 'Name', id: 'name:bob' }),
    ).toBeUndefined();
  });
});
