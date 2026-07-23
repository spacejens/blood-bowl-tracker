import type {
  ImportError,
  RulesSetsImportService,
} from '@blood-bowl-tracker/import';
import { ImportResultService } from '@blood-bowl-tracker/import';
import { describe, expect, it, vi } from 'vitest';

import type { ManualDataFile } from '../data-file/manual-data-file.schema';
import { ExternalIdMap } from '../references/external-id-map';
import type { ProcessContext } from '../references/process-context';
import { ReferenceResolverService } from '../references/reference-resolver.service';
import { RulesSetsProcessor } from './rules-sets.processor';

function makeRefResolver(): ReferenceResolverService {
  return new ReferenceResolverService(new ImportResultService());
}

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
    errors: [] as ImportError[],
  };
}

describe('RulesSetsProcessor', () => {
  it('upserts each rules set, records its external ids, and counts it', async () => {
    const upsertRulesSet = vi.fn().mockResolvedValue({ id: 7 });
    const processor = new RulesSetsProcessor(
      {
        upsertRulesSet,
      } as unknown as RulesSetsImportService,
      makeRefResolver(),
    );
    const data = emptyData();
    data.rulesSets = [
      { name: 'CRP', externalIds: [{ system: 'Name', id: 'name:crp' }] },
    ];
    const ctx = makeContext(data);

    const count = await processor.process(ctx);

    expect(count).toBe(1);
    expect(upsertRulesSet).toHaveBeenCalledWith(
      {
        name: 'CRP',
        externalIds: [{ externalSystemId: 2, externalId: 'name:crp' }],
      },
      ctx.errors,
    );
    expect(ctx.idMap.resolve({ system: 'Name', id: 'name:crp' })).toBe(7);
  });

  it('does not record ids or count when the upsert fails', async () => {
    const upsertRulesSet = vi
      .fn()
      .mockImplementation((_d: unknown, errors: ImportError[]) => {
        errors.push({ item: {}, message: 'boom' });
        return Promise.resolve(undefined);
      });
    const processor = new RulesSetsProcessor(
      {
        upsertRulesSet,
      } as unknown as RulesSetsImportService,
      makeRefResolver(),
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
