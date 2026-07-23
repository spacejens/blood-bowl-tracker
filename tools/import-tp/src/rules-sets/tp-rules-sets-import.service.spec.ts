import type {
  ExternalSystemBootstrapService,
  RulesSetsImportService,
} from '@blood-bowl-tracker/import';
import { NameExternalIdService } from '@blood-bowl-tracker/import';
import { describe, expect, it, vi } from 'vitest';

import type {
  EraDataConfig,
  EraDataConfigService,
} from '../eras/era-data-config.service';
import type { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { TpRulesSetsImportService } from './tp-rules-sets-import.service';

interface MakeServiceOptions {
  getEras: () => EraDataConfig[];
  bootstrap: ReturnType<typeof vi.fn>;
  upsertRulesSet: ReturnType<typeof vi.fn>;
  getTpSystemName?: () => string;
}

function makeService({
  getEras,
  bootstrap,
  upsertRulesSet,
  getTpSystemName = () => 'TP',
}: MakeServiceOptions) {
  return new TpRulesSetsImportService(
    { getEras } as unknown as EraDataConfigService,
    { upsertRulesSet } as unknown as RulesSetsImportService,
    { bootstrap } as unknown as ExternalSystemBootstrapService,
    { getTpSystemName } as unknown as ExternalSystemNameConfigService,
    new NameExternalIdService(),
  );
}

const eras: EraDataConfig[] = [
  {
    name: 'Third era',
    dataSubdir: 'third-era',
    rulesSets: ['LRB6'],
    startDate: '2013-01-01',
  },
  {
    name: 'Fourth era',
    dataSubdir: 'fourth-era',
    rulesSets: ['BB2020', 'LRB6'],
    startDate: '2020-11-28',
  },
];

describe('TpRulesSetsImportService', () => {
  it('upserts each distinct rules-set name and returns a name->id map', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertRulesSet = vi
      .fn()
      .mockResolvedValueOnce({ id: 100, name: 'LRB6' })
      .mockResolvedValueOnce({ id: 200, name: 'BB2020' });
    const service = makeService({
      getEras: () => eras,
      bootstrap,
      upsertRulesSet,
    });

    const { result, rulesSetIdsByName } = await service.importRulesSets();

    expect(result.imported).toBe(2);
    expect(result.success).toBe(true);
    expect(bootstrap).toHaveBeenCalledWith([
      { name: 'TP', category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
    ]);
    // Distinct across eras, first-seen order: LRB6 then BB2020.
    expect(upsertRulesSet).toHaveBeenCalledTimes(2);
    expect(upsertRulesSet).toHaveBeenNthCalledWith(
      1,
      {
        name: 'LRB6',
        externalIds: [
          { externalSystemId: 1, externalId: 'LRB6' },
          { externalSystemId: 2, externalId: 'LRB6' },
        ],
      },
      expect.any(Array),
    );
    expect(rulesSetIdsByName).toEqual(
      new Map([
        ['LRB6', 100],
        ['BB2020', 200],
      ]),
    );
  });

  it('records one error and imports nothing when getEras() throws', async () => {
    const bootstrap = vi.fn();
    const upsertRulesSet = vi.fn();
    const service = makeService({
      getEras: () => {
        throw new Error('TP_ERAS is not set.');
      },
      bootstrap,
      upsertRulesSet,
    });

    const { result, rulesSetIdsByName } = await service.importRulesSets();

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('TP_ERAS is not set.');
    expect(result.errors[0].item).toEqual({ externalSystems: ['TP', 'Name'] });
    expect(rulesSetIdsByName.size).toBe(0);
    expect(bootstrap).not.toHaveBeenCalled();
    expect(upsertRulesSet).not.toHaveBeenCalled();
  });

  it('records one error and imports nothing when an external system upsert fails', async () => {
    const bootstrap = vi.fn().mockResolvedValue({
      ok: false,
      error: {
        item: { externalSystems: ['TP', 'Name'] },
        message: 'network timeout',
      },
    });
    const upsertRulesSet = vi.fn();
    const service = makeService({
      getEras: () => eras,
      bootstrap,
      upsertRulesSet,
    });

    const { result, rulesSetIdsByName } = await service.importRulesSets();

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toBe('network timeout');
    expect(result.errors[0].item).toEqual({ externalSystems: ['TP', 'Name'] });
    expect(rulesSetIdsByName.size).toBe(0);
    expect(upsertRulesSet).not.toHaveBeenCalled();
  });

  it('omits a rules set from the map when its upsert fails', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertRulesSet = vi
      .fn()
      .mockResolvedValueOnce({ id: 100, name: 'LRB6' })
      .mockImplementationOnce(
        (_data: unknown, errors: { message: string }[]) => {
          errors.push({ message: 'rules set boom' });
          return Promise.resolve(undefined);
        },
      );
    const service = makeService({
      getEras: () => eras,
      bootstrap,
      upsertRulesSet,
    });

    const { result, rulesSetIdsByName } = await service.importRulesSets();

    expect(result.imported).toBe(1);
    expect(result.success).toBe(false);
    expect(rulesSetIdsByName).toEqual(new Map([['LRB6', 100]]));
  });
});
