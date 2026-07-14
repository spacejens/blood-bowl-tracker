import type {
  ExternalSystemsImportService,
  RulesSetsImportService,
} from '@blood-bowl-tracker/import';
import { describe, expect, it, vi } from 'vitest';

import type { EraConfig, EraConfigService } from '../eras/era-config.service';
import type { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { BblRulesSetsImportService } from './bbl-rules-sets-import.service';

function makeService(
  getEras: () => EraConfig[],
  upsertExternalSystem: ReturnType<typeof vi.fn>,
  upsertRulesSet: ReturnType<typeof vi.fn>,
  getBblSystemName: () => string = () => 'BBL',
) {
  return new BblRulesSetsImportService(
    { getEras } as unknown as EraConfigService,
    { upsertRulesSet } as unknown as RulesSetsImportService,
    { upsertExternalSystem } as unknown as ExternalSystemsImportService,
    { getBblSystemName } as unknown as ExternalSystemNameConfigService,
  );
}

const twoErasSharingNothing: EraConfig[] = [
  {
    name: 'Living rulebook',
    rulesSets: ['Living rulebook'],
    startDate: '2011-09-09',
    endDate: '2021-09-01',
    firstPlayerId: 1,
  },
  {
    name: 'BB2020',
    rulesSets: ['BB2020'],
    startDate: '2021-09-01',
    firstPlayerId: 5001,
  },
];

describe('BblRulesSetsImportService', () => {
  it('upserts each distinct rules set once with its name under BBL and Name', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertRulesSet = vi
      .fn()
      .mockResolvedValueOnce({ id: 100 })
      .mockResolvedValueOnce({ id: 200 });
    const service = makeService(
      () => twoErasSharingNothing,
      upsertExternalSystem,
      upsertRulesSet,
    );

    const { result, rulesSetIdsByName } = await service.importRulesSets();

    expect(result.imported).toBe(2);
    expect(result.success).toBe(true);
    expect(upsertRulesSet).toHaveBeenCalledTimes(2);
    expect(upsertRulesSet).toHaveBeenNthCalledWith(
      1,
      {
        name: 'Living rulebook',
        externalIds: [
          { externalSystemId: 1, externalId: 'Living rulebook' },
          { externalSystemId: 2, externalId: 'Living rulebook' },
        ],
      },
      expect.any(Array),
    );
    expect(rulesSetIdsByName.get('Living rulebook')).toBe(100);
    expect(rulesSetIdsByName.get('BB2020')).toBe(200);
  });

  it('dedupes a rules set shared by multiple eras, upserting it once', async () => {
    const eras: EraConfig[] = [
      {
        name: 'Era A',
        rulesSets: ['BB2020'],
        startDate: '2021-09-01',
        firstPlayerId: 1,
      },
      {
        name: 'Era B',
        rulesSets: ['BB2020'],
        startDate: '2022-09-01',
        firstPlayerId: 5001,
      },
    ];
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertRulesSet = vi.fn().mockResolvedValue({ id: 200 });
    const service = makeService(
      () => eras,
      upsertExternalSystem,
      upsertRulesSet,
    );

    const { result, rulesSetIdsByName } = await service.importRulesSets();

    expect(upsertRulesSet).toHaveBeenCalledTimes(1);
    expect(result.imported).toBe(1);
    expect(rulesSetIdsByName.get('BB2020')).toBe(200);
  });

  it('imports the distinct rules-set names across all eras (flattened)', async () => {
    const eras: EraConfig[] = [
      {
        name: 'Era A',
        rulesSets: ['CRP', 'CRP+'],
        startDate: '2011-09-09',
        endDate: '2021-09-01',
        firstPlayerId: 1,
        lastPlayerId: 5000,
      },
      {
        name: 'Era B',
        rulesSets: ['CRP+', 'BB2016'],
        startDate: '2021-09-01',
        firstPlayerId: 5001,
      },
    ];
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertRulesSet = vi
      .fn()
      .mockResolvedValueOnce({ id: 10 })
      .mockResolvedValueOnce({ id: 20 })
      .mockResolvedValueOnce({ id: 30 });
    const service = makeService(
      () => eras,
      upsertExternalSystem,
      upsertRulesSet,
    );

    const outcome = await service.importRulesSets();

    expect(upsertRulesSet).toHaveBeenCalledTimes(3);
    const upsertedNames = upsertRulesSet.mock.calls.map(
      (c) => (c[0] as { name: string }).name,
    );
    expect(new Set(upsertedNames)).toEqual(
      new Set(['CRP', 'CRP+', 'BB2016']),
    );
    expect(
      upsertRulesSet.mock.calls.every(
        (c) => !('races' in (c[0] as Record<string, unknown>)),
      ),
    ).toBe(true);
    expect('rulesSetsByName' in outcome).toBe(false);
    expect(outcome.result.imported).toBe(3);
  });

  it('records an error and maps no id when a rules set upsert fails', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertRulesSet = vi
      .fn()
      .mockImplementation((_data: unknown, errors: { message: string }[]) => {
        errors.push({ message: 'boom' });
        return Promise.resolve(undefined);
      });
    const service = makeService(
      () => [
        {
          name: 'BB2020',
          rulesSets: ['BB2020'],
          startDate: '2021-09-01',
          firstPlayerId: 1,
        },
      ],
      upsertExternalSystem,
      upsertRulesSet,
    );

    const { result, rulesSetIdsByName } = await service.importRulesSets();

    expect(result.imported).toBe(0);
    expect(result.success).toBe(false);
    expect(rulesSetIdsByName.has('BB2020')).toBe(false);
  });

  it('records one error and imports nothing when BBL_ERAS is unset', async () => {
    const upsertExternalSystem = vi.fn();
    const upsertRulesSet = vi.fn();
    const service = makeService(
      () => {
        throw new Error('BBL_ERAS is not set.');
      },
      upsertExternalSystem,
      upsertRulesSet,
    );

    const { result } = await service.importRulesSets();

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.message.includes('BBL_ERAS'))).toBe(
      true,
    );
    expect(upsertRulesSet).not.toHaveBeenCalled();
  });

  it('records one error and imports nothing when an external system upsert fails', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockRejectedValue(new Error('Failed to upsert external system "BBL"'));
    const upsertRulesSet = vi.fn();
    const service = makeService(
      () => twoErasSharingNothing,
      upsertExternalSystem,
      upsertRulesSet,
    );

    const { result } = await service.importRulesSets();

    expect(result.success).toBe(false);
    expect(
      result.errors.some((e) => e.message.includes('external system')),
    ).toBe(true);
    expect(upsertRulesSet).not.toHaveBeenCalled();
  });
});
