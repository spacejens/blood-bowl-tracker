import type { ImportError } from '@blood-bowl-tracker/import';
import { RulesSetsImportService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { ManualDataFile } from '../data-file/manual-data-file.schema';
import { ExternalIdMap } from '../references/external-id-map';
import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';
import { RulesSetsProcessor } from './rules-sets.processor';

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

describe('RulesSetsProcessor', () => {
  let processor: RulesSetsProcessor;
  let rulesSets: MockProxy<RulesSetsImportService>;
  let refResolver: MockProxy<ReferenceResolverService>;

  beforeEach(async () => {
    rulesSets = mock<RulesSetsImportService>();
    refResolver = mock<ReferenceResolverService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        RulesSetsProcessor,
        { provide: RulesSetsImportService, useValue: rulesSets },
        { provide: ReferenceResolverService, useValue: refResolver },
      ],
    }).compile();
    processor = moduleRef.get(RulesSetsProcessor);
  });

  it('upserts each rules set, records its external ids, and counts it', async () => {
    rulesSets.upsertRulesSet.mockResolvedValue({
      id: 7,
      name: 'CRP',
      createdAt: new Date(),
      created: true,
    });
    const cannedExternalIds = [
      { externalSystemId: 99, externalId: 'canned:crp' },
    ];
    refResolver.toExternalIds.mockReturnValue(cannedExternalIds);
    const data = emptyData();
    data.rulesSets = [
      { name: 'CRP', externalIds: [{ system: 'Name', id: 'name:crp' }] },
    ];
    const ctx = makeContext(data);

    const count = await processor.process(ctx);

    expect(count).toBe(1);
    expect(refResolver.toExternalIds).toHaveBeenCalledWith(
      data.rulesSets[0].externalIds,
      ctx.systemIds,
    );
    expect(rulesSets.upsertRulesSet).toHaveBeenCalledWith(
      { name: 'CRP', externalIds: cannedExternalIds },
      ctx.errors,
    );
    expect(ctx.idMap.resolve({ system: 'Name', id: 'name:crp' })).toBe(7);
  });

  it('does not record ids or count when the upsert fails', async () => {
    rulesSets.upsertRulesSet.mockImplementation(
      (_data: unknown, errors: ImportError[]) => {
        errors.push({ item: {}, message: 'boom' });
        return Promise.resolve(undefined);
      },
    );
    const data = emptyData();
    data.rulesSets = [
      { name: 'CRP', externalIds: [{ system: 'Name', id: 'name:crp' }] },
    ];
    const ctx = makeContext(data);

    const count = await processor.process(ctx);

    expect(count).toBe(0);
    expect(
      ctx.idMap.resolve({ system: 'Name', id: 'name:crp' }),
    ).toBeUndefined();
  });
});
