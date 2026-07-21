import type {
  ExternalSystemBootstrapService,
  RulesSetsImportService,
} from '@blood-bowl-tracker/import';
import { describe, expect, it, vi } from 'vitest';

import type { EraConfig, EraConfigService } from '../eras/era-config.service';
import type { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { BblRulesSetsImportService } from './bbl-rules-sets-import.service';

interface MakeServiceOptions {
  getEras: () => EraConfig[];
  bootstrap: ReturnType<typeof vi.fn>;
  upsertRulesSet: ReturnType<typeof vi.fn>;
  getBblSystemName?: () => string;
}

function makeService({
  getEras,
  bootstrap,
  upsertRulesSet,
  getBblSystemName = () => 'BBL',
}: MakeServiceOptions) {
  return new BblRulesSetsImportService(
    { getEras } as unknown as EraConfigService,
    { upsertRulesSet } as unknown as RulesSetsImportService,
    { bootstrap } as unknown as ExternalSystemBootstrapService,
    { getBblSystemName } as unknown as ExternalSystemNameConfigService,
  );
}

const twoErasSharingNothing: EraConfig[] = [
  {
    identity: {
      name: 'Living rulebook',
      rulesSets: ['Living rulebook'],
    },
    dates: {
      startDate: '2011-09-09',
      endDate: '2021-09-01',
      autoAssignByDate: true,
    },
    players: {
      firstPlayerId: 1,
      autoAssignByPlayerId: true,
    },
  },
  {
    identity: {
      name: 'BB2020',
      rulesSets: ['BB2020'],
    },
    dates: {
      startDate: '2021-09-01',
      autoAssignByDate: true,
    },
    players: {
      firstPlayerId: 5001,
      autoAssignByPlayerId: true,
    },
  },
];

describe('BblRulesSetsImportService', () => {
  it('upserts each distinct rules set once with its name under BBL and Name', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertRulesSet = vi
      .fn()
      .mockResolvedValueOnce({ id: 100 })
      .mockResolvedValueOnce({ id: 200 });
    const service = makeService({
      getEras: () => twoErasSharingNothing,
      bootstrap,
      upsertRulesSet,
    });

    const { result, rulesSetIdsByName } = await service.importRulesSets();

    expect(result.imported).toBe(2);
    expect(result.success).toBe(true);
    expect(bootstrap).toHaveBeenCalledWith([
      { name: 'BBL', isBookkeeping: false },
      { name: 'Name', isBookkeeping: true },
    ]);
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
        identity: {
          name: 'Era A',
          rulesSets: ['BB2020'],
        },
        dates: {
          startDate: '2021-09-01',
          autoAssignByDate: true,
        },
        players: {
          firstPlayerId: 1,
          autoAssignByPlayerId: true,
        },
      },
      {
        identity: {
          name: 'Era B',
          rulesSets: ['BB2020'],
        },
        dates: {
          startDate: '2022-09-01',
          autoAssignByDate: true,
        },
        players: {
          firstPlayerId: 5001,
          autoAssignByPlayerId: true,
        },
      },
    ];
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertRulesSet = vi.fn().mockResolvedValue({ id: 200 });
    const service = makeService({
      getEras: () => eras,
      bootstrap,
      upsertRulesSet,
    });

    const { result, rulesSetIdsByName } = await service.importRulesSets();

    expect(upsertRulesSet).toHaveBeenCalledTimes(1);
    expect(result.imported).toBe(1);
    expect(rulesSetIdsByName.get('BB2020')).toBe(200);
  });

  it('imports the distinct rules-set names across all eras (flattened)', async () => {
    const eras: EraConfig[] = [
      {
        identity: {
          name: 'Era A',
          rulesSets: ['CRP', 'CRP+'],
        },
        dates: {
          startDate: '2011-09-09',
          endDate: '2021-09-01',
          autoAssignByDate: true,
        },
        players: {
          firstPlayerId: 1,
          lastPlayerId: 5000,
          autoAssignByPlayerId: true,
        },
      },
      {
        identity: {
          name: 'Era B',
          rulesSets: ['CRP+', 'BB2016'],
        },
        dates: {
          startDate: '2021-09-01',
          autoAssignByDate: true,
        },
        players: {
          firstPlayerId: 5001,
          autoAssignByPlayerId: true,
        },
      },
    ];
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertRulesSet = vi
      .fn()
      .mockResolvedValueOnce({ id: 10 })
      .mockResolvedValueOnce({ id: 20 })
      .mockResolvedValueOnce({ id: 30 });
    const service = makeService({
      getEras: () => eras,
      bootstrap,
      upsertRulesSet,
    });

    const outcome = await service.importRulesSets();

    expect(bootstrap).toHaveBeenCalledWith([
      { name: 'BBL', isBookkeeping: false },
      { name: 'Name', isBookkeeping: true },
    ]);
    expect(upsertRulesSet).toHaveBeenCalledTimes(3);
    const upsertedNames = upsertRulesSet.mock.calls.map(
      (c) => (c[0] as { name: string }).name,
    );
    expect(new Set(upsertedNames)).toEqual(new Set(['CRP', 'CRP+', 'BB2016']));
    expect(
      upsertRulesSet.mock.calls.every(
        (c) => !('races' in (c[0] as Record<string, unknown>)),
      ),
    ).toBe(true);
    expect('rulesSetsByName' in outcome).toBe(false);
    expect(outcome.result.imported).toBe(3);
  });

  it('records an error and maps no id when a rules set upsert fails', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertRulesSet = vi
      .fn()
      .mockImplementation((_data: unknown, errors: { message: string }[]) => {
        errors.push({ message: 'boom' });
        return Promise.resolve(undefined);
      });
    const service = makeService({
      getEras: () => [
        {
          identity: {
            name: 'BB2020',
            rulesSets: ['BB2020'],
          },
          dates: {
            startDate: '2021-09-01',
            autoAssignByDate: true,
          },
          players: {
            firstPlayerId: 1,
            autoAssignByPlayerId: true,
          },
        },
      ],
      bootstrap,
      upsertRulesSet,
    });

    const { result, rulesSetIdsByName } = await service.importRulesSets();

    expect(result.imported).toBe(0);
    expect(result.success).toBe(false);
    expect(rulesSetIdsByName.has('BB2020')).toBe(false);
  });

  it('records one error and imports nothing when BBL_ERAS is unset', async () => {
    const bootstrap = vi.fn();
    const upsertRulesSet = vi.fn();
    const service = makeService({
      getEras: () => {
        throw new Error('BBL_ERAS is not set.');
      },
      bootstrap,
      upsertRulesSet,
    });

    const { result } = await service.importRulesSets();

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.message.includes('BBL_ERAS'))).toBe(
      true,
    );
    expect(upsertRulesSet).not.toHaveBeenCalled();
  });

  it('records one error and imports nothing when an external system upsert fails', async () => {
    const bootstrap = vi.fn().mockResolvedValue({
      ok: false,
      error: {
        item: { externalSystems: ['BBL', 'Name'] },
        message: 'network timeout',
      },
    });
    const upsertRulesSet = vi.fn();
    const service = makeService({
      getEras: () => twoErasSharingNothing,
      bootstrap,
      upsertRulesSet,
    });

    const { result } = await service.importRulesSets();

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    // Message is passed through unchanged (this caller adds no prefix): the
    // assertion now fails if production stops surfacing the real error text.
    expect(result.errors[0].message).toBe('network timeout');
    // And the error names the external systems the bootstrap tried to upsert.
    expect(result.errors[0].item).toEqual({
      externalSystems: ['BBL', 'Name'],
    });
    expect(upsertRulesSet).not.toHaveBeenCalled();
  });
});
