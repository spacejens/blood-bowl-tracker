import type {
  ErasImportService,
  ExternalSystemBootstrapService,
} from '@blood-bowl-tracker/import';
import { NameExternalIdService } from '@blood-bowl-tracker/import';
import { describe, expect, it, vi } from 'vitest';

import type { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';
import { BblErasImportService } from './bbl-eras-import.service';
import type { EraConfig, EraConfigService } from './era-config.service';

interface MakeServiceOptions {
  getEras: () => EraConfig[];
  bootstrap: ReturnType<typeof vi.fn>;
  upsertEra: ReturnType<typeof vi.fn>;
  getBblSystemName?: () => string;
}

function makeService({
  getEras,
  bootstrap,
  upsertEra,
  getBblSystemName = () => 'BBL',
}: MakeServiceOptions) {
  return new BblErasImportService(
    { getEras } as unknown as EraConfigService,
    { upsertEra } as unknown as ErasImportService,
    { bootstrap } as unknown as ExternalSystemBootstrapService,
    { getBblSystemName } as unknown as ExternalSystemNameConfigService,
    new NameExternalIdService(),
  );
}

const eras: EraConfig[] = [
  {
    leagueName: 'tLoEG',
    identity: { name: 'Living rulebook', rulesSets: ['Living rulebook'] },
    dates: {
      startDate: '2011-09-09',
      endDate: '2021-09-01',
      autoAssignByDate: true,
    },
    players: { firstPlayerId: 1, autoAssignByPlayerId: true },
  },
  {
    leagueName: 'tLoEG',
    identity: { name: 'BB2020', rulesSets: ['BB2020'] },
    dates: { startDate: '2021-09-01', autoAssignByDate: true },
    players: { firstPlayerId: 5001, autoAssignByPlayerId: true },
  },
];

const rulesSetIds = new Map<string, number>([
  ['Living rulebook', 100],
  ['BB2020', 200],
]);

const leagueIds = new Map<string, number>([['tLoEG', 10]]);

describe('BblErasImportService', () => {
  it('upserts each era referencing the league id and its rules set id', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertEra = vi
      .fn()
      .mockResolvedValueOnce({ id: 500, name: 'Living rulebook' })
      .mockResolvedValueOnce({ id: 600, name: 'BB2020' });
    const service = makeService({
      getEras: () => eras,
      bootstrap,
      upsertEra,
    });

    const { result, eraIdsByName } = await service.importEras(
      leagueIds,
      rulesSetIds,
    );

    expect(result.imported).toBe(2);
    expect(result.success).toBe(true);
    expect(bootstrap).toHaveBeenCalledWith([
      { name: 'BBL', category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
    ]);
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

  it("resolves each era's league id from the map by its stamped name", async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertEra = vi.fn().mockResolvedValue({ id: 500, name: 'x' });
    const service = makeService({ getEras: () => eras, bootstrap, upsertEra });

    await service.importEras(leagueIds, rulesSetIds);

    expect(upsertEra).toHaveBeenCalledWith(
      expect.objectContaining({ leagueId: 10 }),
      expect.anything(),
    );
  });

  it('records an error and skips an era whose league was not imported', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertEra = vi.fn().mockResolvedValue({ id: 700, name: 'GBBL 1' });
    const gbblEra: EraConfig[] = [
      {
        leagueName: 'GBBL',
        identity: { name: 'GBBL 1', rulesSets: ['BB2016'] },
        dates: {
          startDate: '2019-08-03',
          endDate: '2019-11-13',
          autoAssignByDate: false,
        },
        players: { autoAssignByPlayerId: false },
        teams: { teamCodeOverrides: ['fes2'] },
      },
    ];
    const service = makeService({
      getEras: () => gbblEra,
      bootstrap,
      upsertEra,
    });

    // leagueIds only has tLoEG, not GBBL.
    const { result } = await service.importEras(
      leagueIds,
      new Map([['BB2016', 300]]),
    );

    expect(upsertEra).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(
      result.errors.some(
        (e) => e.message.includes('GBBL 1') && e.message.includes('league'),
      ),
    ).toBe(true);
  });

  it('skips an era whose rules set was not imported, recording an error', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertEra = vi.fn().mockResolvedValue({ id: 1, name: 'x' });
    const partialIds = new Map<string, number>([['Living rulebook', 100]]);
    const service = makeService({
      getEras: () => eras,
      bootstrap,
      upsertEra,
    });

    const { result } = await service.importEras(leagueIds, partialIds);

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
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertEra = vi
      .fn()
      .mockImplementation((_data: unknown, errors: { message: string }[]) => {
        errors.push({ message: 'era boom' });
        return Promise.resolve(undefined);
      });
    const service = makeService({
      getEras: () => [eras[1]],
      bootstrap,
      upsertEra,
    });

    const { result } = await service.importEras(leagueIds, rulesSetIds);

    expect(result.imported).toBe(0);
    expect(result.success).toBe(false);
  });

  it('records an error and skips an era whose rules-set name does not resolve', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertEra = vi.fn();
    const multiRulesSetEras: EraConfig[] = [
      {
        leagueName: 'tLoEG',
        identity: { name: 'CRP era', rulesSets: ['CRP', 'MISSING'] },
        dates: { startDate: '2016-01-01', autoAssignByDate: true },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
      },
    ];
    const service = makeService({
      getEras: () => multiRulesSetEras,
      bootstrap,
      upsertEra,
    });

    const { result } = await service.importEras(
      leagueIds,
      new Map([['CRP', 20]]),
    );

    expect(upsertEra).not.toHaveBeenCalled();
    expect(result.errors[0].message).toMatch(/MISSING/);
  });

  it('resolves all rules-set names to ids and passes the array', async () => {
    const bootstrap = vi.fn().mockResolvedValue({ ok: true, ids: [1, 2] });
    const upsertEra = vi.fn().mockResolvedValue({ id: 1, name: 'CRP era' });
    const multiRulesSetEras: EraConfig[] = [
      {
        leagueName: 'tLoEG',
        identity: { name: 'CRP era', rulesSets: ['CRP', 'CRP+'] },
        dates: { startDate: '2016-01-01', autoAssignByDate: true },
        players: { firstPlayerId: 1, autoAssignByPlayerId: true },
      },
    ];
    const service = makeService({
      getEras: () => multiRulesSetEras,
      bootstrap,
      upsertEra,
    });

    await service.importEras(
      leagueIds,
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
    const bootstrap = vi.fn();
    const upsertEra = vi.fn();
    const service = makeService({
      getEras: () => {
        throw new Error('BBL_ERAS is not set.');
      },
      bootstrap,
      upsertEra,
    });

    const { result } = await service.importEras(leagueIds, rulesSetIds);

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.message.includes('BBL_ERAS'))).toBe(
      true,
    );
    expect(upsertEra).not.toHaveBeenCalled();
  });

  it('records one error and imports nothing when an external system upsert fails', async () => {
    const bootstrap = vi.fn().mockResolvedValue({
      ok: false,
      error: {
        item: { externalSystems: ['BBL', 'Name'] },
        message: 'network timeout',
      },
    });
    const upsertEra = vi.fn();
    const service = makeService({
      getEras: () => eras,
      bootstrap,
      upsertEra,
    });

    const { result } = await service.importEras(leagueIds, rulesSetIds);

    expect(result.success).toBe(false);
    expect(result.errors).toHaveLength(1);
    // Message is passed through unchanged (this caller adds no prefix): the
    // assertion now fails if production stops surfacing the real error text.
    expect(result.errors[0].message).toBe('network timeout');
    // And the error names the external systems the bootstrap tried to upsert.
    expect(result.errors[0].item).toEqual({
      externalSystems: ['BBL', 'Name'],
    });
    expect(upsertEra).not.toHaveBeenCalled();
  });
});
