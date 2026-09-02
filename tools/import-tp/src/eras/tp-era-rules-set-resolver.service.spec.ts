import type { ImportError } from '@blood-bowl-tracker/import';
import {
  ImportResultService,
  ReferenceLookupService,
} from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';

import {
  mockImportResultService,
  mockReferenceLookupService,
} from '../import-package.test-helpers';
import type { EraDataConfig } from './era-data-config.service';
import { TpEraRulesSetResolverService } from './tp-era-rules-set-resolver.service';

const TP_SYSTEM_ID = 1;

function era(name: string, rulesSets: string[]): EraDataConfig {
  return { name, dataSubdir: name, rulesSets, startDate: '2020-01-01' };
}

describe('TpEraRulesSetResolverService', () => {
  let importResults: MockProxy<ImportResultService>;
  let lookup: MockProxy<ReferenceLookupService>;
  let errors: ImportError[];

  async function makeService(
    rulesSetIdsByName: Map<string, number>,
  ): Promise<TpEraRulesSetResolverService> {
    importResults = mockImportResultService();
    lookup = mockReferenceLookupService(
      new Map<string, number>(),
      TP_SYSTEM_ID,
      { rulesSetIdsByName },
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpEraRulesSetResolverService,
        { provide: ImportResultService, useValue: importResults },
        { provide: ReferenceLookupService, useValue: lookup },
      ],
    }).compile();
    return moduleRef.get(TpEraRulesSetResolverService);
  }

  beforeEach(() => {
    errors = [];
  });

  it("maps each era declaring exactly one rules set to that rules set's DB id", async () => {
    const service = await makeService(
      new Map([
        ['BB2020', 900],
        ['BB2025', 901],
      ]),
    );

    const resolved = await service.resolveRulesSetIdByEraName({
      eras: [era('Fourth era', ['BB2020']), era('Fifth era', ['BB2025'])],
      tpSystemId: TP_SYSTEM_ID,
      errors,
    });

    expect([...resolved]).toEqual([
      ['Fourth era', 900],
      ['Fifth era', 901],
    ]);
    expect(errors).toHaveLength(0);
  });

  it('skips an era declaring more than one rules set, with one error naming it', async () => {
    const service = await makeService(new Map([['BB2025', 901]]));

    const resolved = await service.resolveRulesSetIdByEraName({
      eras: [era('Fourth era', ['BB2020', 'BB2025'])],
      tpSystemId: TP_SYSTEM_ID,
      errors,
    });

    expect(resolved.size).toBe(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Fourth era');
    expect(errors[0].message).toContain('declares 2 rules sets');
  });

  it('skips an era declaring zero rules sets, with one error naming it', async () => {
    const service = await makeService(new Map());

    const resolved = await service.resolveRulesSetIdByEraName({
      eras: [era('Fourth era', [])],
      tpSystemId: TP_SYSTEM_ID,
      errors,
    });

    expect(resolved.size).toBe(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('declares 0 rules sets');
  });

  it('skips an era whose rules set id does not resolve, with one error', async () => {
    const service = await makeService(new Map([['BB2025', 901]]));

    const resolved = await service.resolveRulesSetIdByEraName({
      eras: [era('Fourth era', ['BB2020']), era('Fifth era', ['BB2025'])],
      tpSystemId: TP_SYSTEM_ID,
      errors,
    });

    expect([...resolved]).toEqual([['Fifth era', 901]]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Could not resolve rules set "BB2020"');
  });

  it('records an unresolvable rules set only once across the eras that share it', async () => {
    const service = await makeService(new Map());

    await service.resolveRulesSetIdByEraName({
      eras: [era('Fourth era', ['BB2020']), era('Fifth era', ['BB2020'])],
      tpSystemId: TP_SYSTEM_ID,
      errors,
    });

    expect(errors).toHaveLength(1);
  });

  it('resolves every distinct rules set name in one batched lookup', async () => {
    const service = await makeService(new Map([['BB2020', 900]]));

    await service.resolveRulesSetIdByEraName({
      eras: [era('Fourth era', ['BB2020']), era('Fifth era', ['BB2020'])],
      tpSystemId: TP_SYSTEM_ID,
      errors,
    });

    expect(lookup.lookupMap).toHaveBeenCalledTimes(1);
    expect(lookup.lookupMap).toHaveBeenCalledWith('rulesSet', [
      { externalSystemId: TP_SYSTEM_ID, externalId: 'BB2020' },
    ]);
  });
});
