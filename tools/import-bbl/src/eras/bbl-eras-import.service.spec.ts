import type {
  ErasImportService,
  ExternalSystemsImportService,
} from '@blood-bowl-tracker/import';
import { describe, expect, it, vi } from 'vitest';

import type { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { BblErasImportService } from './bbl-eras-import.service';
import type { EraConfig, EraConfigService } from './era-config.service';

function makeService(
  getEras: () => EraConfig[],
  upsertExternalSystem: ReturnType<typeof vi.fn>,
  upsertEra: ReturnType<typeof vi.fn>,
  getBblSystemName: () => string = () => 'BBL',
) {
  return new BblErasImportService(
    { getEras } as unknown as EraConfigService,
    { upsertEra } as unknown as ErasImportService,
    { upsertExternalSystem } as unknown as ExternalSystemsImportService,
    { getBblSystemName } as unknown as ExternalSystemNameConfigService,
  );
}

const eras: EraConfig[] = [
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

const rulesSetIds = new Map<string, number>([
  ['Living rulebook', 100],
  ['BB2020', 200],
]);

describe('BblErasImportService', () => {
  it('upserts each era referencing the league id and its rules set id', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertEra = vi
      .fn()
      .mockResolvedValueOnce({ id: 500, name: 'Living rulebook' })
      .mockResolvedValueOnce({ id: 600, name: 'BB2020' });
    const service = makeService(() => eras, upsertExternalSystem, upsertEra);

    const { result, eraIdsByName } = await service.importEras(10, rulesSetIds);

    expect(result.imported).toBe(2);
    expect(result.success).toBe(true);
    expect(eraIdsByName).toEqual(
      new Map([
        ['Living rulebook', 500],
        ['BB2020', 600],
      ]),
    );
    expect(upsertEra).toHaveBeenNthCalledWith(
      1,
      {
        name: 'Living rulebook',
        leagueId: 10,
        rulesSetIds: [100],
        startDate: '2011-09-09',
        endDate: '2021-09-01',
        externalIds: [
          { externalSystemId: 1, externalId: 'Living rulebook' },
          { externalSystemId: 2, externalId: 'Living rulebook' },
        ],
      },
      expect.any(Array),
    );
    expect(upsertEra).toHaveBeenNthCalledWith(
      2,
      {
        name: 'BB2020',
        leagueId: 10,
        rulesSetIds: [200],
        startDate: '2021-09-01',
        endDate: undefined,
        externalIds: [
          { externalSystemId: 1, externalId: 'BB2020' },
          { externalSystemId: 2, externalId: 'BB2020' },
        ],
      },
      expect.any(Array),
    );
  });

  it('records one error and imports nothing when the league id is missing', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertEra = vi.fn();
    const service = makeService(() => eras, upsertExternalSystem, upsertEra);

    const { result } = await service.importEras(undefined, rulesSetIds);

    expect(result.success).toBe(false);
    expect(result.imported).toBe(0);
    expect(result.errors.some((e) => e.message.includes('league'))).toBe(true);
    expect(upsertEra).not.toHaveBeenCalled();
  });

  it('skips an era whose rules set was not imported, recording an error', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertEra = vi.fn().mockResolvedValue({ id: 1, name: 'x' });
    const partialIds = new Map<string, number>([['Living rulebook', 100]]);
    const service = makeService(() => eras, upsertExternalSystem, upsertEra);

    const { result } = await service.importEras(10, partialIds);

    expect(result.imported).toBe(1);
    expect(result.success).toBe(false);
    expect(upsertEra).toHaveBeenCalledTimes(1);
    expect(
      result.errors.some(
        (e) => e.message.includes('BB2020') && e.message.includes('rules set'),
      ),
    ).toBe(true);
  });

  it('records an error when an era upsert fails', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertEra = vi
      .fn()
      .mockImplementation((_data: unknown, errors: { message: string }[]) => {
        errors.push({ message: 'era boom' });
        return Promise.resolve(undefined);
      });
    const service = makeService(
      () => [eras[1]],
      upsertExternalSystem,
      upsertEra,
    );

    const { result } = await service.importEras(10, rulesSetIds);

    expect(result.imported).toBe(0);
    expect(result.success).toBe(false);
  });

  it('records an error and skips an era whose rules-set name does not resolve', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertEra = vi.fn();
    const multiRulesSetEras: EraConfig[] = [
      {
        name: 'CRP era',
        rulesSets: ['CRP', 'MISSING'],
        startDate: '2016-01-01',
        firstPlayerId: 1,
      },
    ];
    const service = makeService(
      () => multiRulesSetEras,
      upsertExternalSystem,
      upsertEra,
    );

    const { result } = await service.importEras(
      10,
      new Map([['CRP', 20]]),
    );

    expect(upsertEra).not.toHaveBeenCalled();
    expect(result.errors[0].message).toMatch(/MISSING/);
  });

  it('resolves all rules-set names to ids and passes the array', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const upsertEra = vi.fn().mockResolvedValue({ id: 1, name: 'CRP era' });
    const multiRulesSetEras: EraConfig[] = [
      {
        name: 'CRP era',
        rulesSets: ['CRP', 'CRP+'],
        startDate: '2016-01-01',
        firstPlayerId: 1,
      },
    ];
    const service = makeService(
      () => multiRulesSetEras,
      upsertExternalSystem,
      upsertEra,
    );

    await service.importEras(
      10,
      new Map([
        ['CRP', 20],
        ['CRP+', 21],
      ]),
    );

    expect(upsertEra).toHaveBeenCalledWith(
      expect.objectContaining({ rulesSetIds: [20, 21] }),
      expect.anything(),
    );
  });

  it('records one error and imports nothing when BBL_ERAS is unset', async () => {
    const upsertExternalSystem = vi.fn();
    const upsertEra = vi.fn();
    const service = makeService(
      () => {
        throw new Error('BBL_ERAS is not set.');
      },
      upsertExternalSystem,
      upsertEra,
    );

    const { result } = await service.importEras(10, rulesSetIds);

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.message.includes('BBL_ERAS'))).toBe(
      true,
    );
    expect(upsertEra).not.toHaveBeenCalled();
  });

  it('records one error and imports nothing when an external system upsert fails', async () => {
    const upsertExternalSystem = vi
      .fn()
      .mockRejectedValue(new Error('Failed to upsert external system "BBL"'));
    const upsertEra = vi.fn();
    const service = makeService(() => eras, upsertExternalSystem, upsertEra);

    const { result } = await service.importEras(10, rulesSetIds);

    expect(result.success).toBe(false);
    expect(
      result.errors.some((e) => e.message.includes('external system')),
    ).toBe(true);
    expect(upsertEra).not.toHaveBeenCalled();
  });
});
