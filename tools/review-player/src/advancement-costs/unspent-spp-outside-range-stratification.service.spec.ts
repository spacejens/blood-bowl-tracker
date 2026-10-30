import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb, PgDialect, SQL } from '@blood-bowl-tracker/db/test-helpers';
import { ExternalSystemLookupService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { PlayerProjectionQueryService } from '../shared/player-projection-query.service';
import type {
  AdvancementHistory,
  UnspentSppModel,
} from './advancement-cost-model.types';
import { AdvancementCostRangeService } from './advancement-cost-range.service';
import { PlayerAdvancementHistoryService } from './player-advancement-history.service';
import { SourceSpendComparisonService } from './source-spend-comparison.service';
import type { SourceUnspentSppFigure } from './source-unspent-spp-figure.service';
import { SourceUnspentSppFigureService } from './source-unspent-spp-figure.service';
import { UnspentSppOutsideRangeStratificationService } from './unspent-spp-outside-range-stratification.service';

const STRATUM = 'unspent-spp-outside-range';

function row(playerId: number) {
  return {
    playerId,
    externalId: String(1000 + playerId),
    playerName: `Player ${playerId}`,
    teamName: 'Reikland Reavers',
    positionName: 'Blitzer',
    eraName: 'Third Era',
  };
}

const KIND_PRICED: UnspentSppModel = {
  rulesSetName: 'BB2020',
  fixedThresholds: false,
  rows: [],
  totalSpp: 60,
  range: { spentMin: 10, spentMax: 20, unspentMin: 40, unspentMax: 50 },
  unknownReason: null,
};
const FIXED: UnspentSppModel = {
  ...KIND_PRICED,
  rulesSetName: 'CRP',
  fixedThresholds: true,
};
const UNKNOWN: UnspentSppModel = {
  ...KIND_PRICED,
  range: null,
  unknownReason: 'no_costs',
};

/** A source figure whose own spend is `total - unspent`. */
function figure(
  source: 'bbl' | 'tp',
  spend: number | null,
): SourceUnspentSppFigure {
  return {
    source,
    unspentLabel: 'unspent',
    unspent: spend === null ? null : 30 - spend,
    totalLabel: 'total',
    reportedTotal: 30,
    spendLabel: 'spend',
  };
}

describe('UnspentSppOutsideRangeStratificationService', () => {
  let service: UnspentSppOutsideRangeStratificationService;
  let dbResult: MockDbResult;
  let history: MockProxy<PlayerAdvancementHistoryService>;
  let range: MockProxy<AdvancementCostRangeService>;
  let figures: MockProxy<SourceUnspentSppFigureService>;

  async function build(candidates: ReturnType<typeof row>[]): Promise<void> {
    dbResult = mockDb(candidates);
    const externalSystems = mock<ExternalSystemLookupService>();
    externalSystems.getSystemId.mockResolvedValue(9);
    const query = mock<PlayerProjectionQueryService>();
    query.base.mockReturnValue(
      dbResult.db.select() as unknown as ReturnType<
        PlayerProjectionQueryService['base']
      >,
    );
    history = mock<PlayerAdvancementHistoryService>();
    history.forPlayers.mockResolvedValue(
      new Map(
        candidates.map((c) => [
          c.playerId,
          { playerId: c.playerId } as AdvancementHistory,
        ]),
      ),
    );
    range = mock<AdvancementCostRangeService>();
    figures = mock<SourceUnspentSppFigureService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        UnspentSppOutsideRangeStratificationService,
        { provide: ExternalSystemLookupService, useValue: externalSystems },
        { provide: PlayerProjectionQueryService, useValue: query },
        { provide: PlayerAdvancementHistoryService, useValue: history },
        { provide: AdvancementCostRangeService, useValue: range },
        { provide: SourceUnspentSppFigureService, useValue: figures },
        // A pure, dependency-free decision service: passed real so the
        // stratum is checked against the same comparison the panel uses.
        SourceSpendComparisonService,
      ],
    }).compile();
    service = moduleRef.get(UnspentSppOutsideRangeStratificationService);
  }

  async function listed(
    source: 'bbl' | 'tp',
    model: UnspentSppModel,
    reported: SourceUnspentSppFigure | null,
  ): Promise<number[]> {
    range.model.mockReturnValue(model);
    figures.figureFor.mockResolvedValue(reported);
    const found = await service.sampleStratum({
      source,
      stratumId: STRATUM,
      limit: 3,
    });
    return found.map((p) => p.playerId);
  }

  beforeEach(async () => {
    await build([row(1)]);
  });

  it('offers one stratum for both sources', () => {
    expect(service.listStrata()).toEqual([
      {
        id: STRATUM,
        label: 'Source-reported spend outside the modelled spend range',
        sources: ['bbl', 'tp'],
      },
    ]);
  });

  it('lists every player whose reported spend is outside, ignoring the limit', async () => {
    await build([row(1), row(2), row(3)]);
    range.model.mockReturnValue(KIND_PRICED);
    figures.figureFor
      .mockResolvedValueOnce(figure('bbl', 9))
      .mockResolvedValueOnce(figure('bbl', 15))
      .mockResolvedValueOnce(figure('bbl', 21));

    const found = await service.sampleStratum({
      source: 'bbl',
      stratumId: STRATUM,
      limit: 1,
    });

    expect(found.map((p) => p.playerId)).toEqual([1, 3]);
    expect(found[0]).toEqual({ source: 'bbl', ...row(1) });
    expect(figures.figureFor).toHaveBeenCalledWith({
      source: 'bbl',
      externalId: '1001',
    });
    expect(history.forPlayers).toHaveBeenCalledWith([1, 2, 3]);
  });

  it.each([
    ['below', 9, [1]],
    ['at the lower bound of', 10, []],
    ['inside', 15, []],
    ['at the upper bound of', 20, []],
    ['above', 21, [1]],
  ] as const)(
    'places a reported spend %s the modelled spend range',
    async (_where, spend, expected) => {
      expect(await listed('tp', KIND_PRICED, figure('tp', spend))).toEqual(
        expected,
      );
      expect(figures.figureFor).toHaveBeenCalledWith({
        source: 'tp',
        externalId: '1001',
      });
    },
  );

  it.each([
    ['a null total', { ...figure('tp', 99), reportedTotal: null }],
    ['a null unspent figure', figure('tp', null)],
    ['no source figure', null],
  ])('never lists a player with %s', async (_what, reported) => {
    expect(await listed('tp', KIND_PRICED, reported)).toEqual([]);
  });

  it('never lists a BBL player under a fixed-threshold rules set', async () => {
    expect(await listed('bbl', FIXED, figure('bbl', 99))).toEqual([]);
  });

  it('compares a BBL player under a kind-priced rules set', async () => {
    expect(await listed('bbl', KIND_PRICED, figure('bbl', 99))).toEqual([1]);
  });

  it('compares a TP player under a fixed-threshold rules set', async () => {
    expect(await listed('tp', FIXED, figure('tp', 99))).toEqual([1]);
  });

  it('handles a large candidate set in one history load', async () => {
    const many = Array.from({ length: 2500 }, (_, i) => row(i + 1));
    await build(many);
    range.model.mockReturnValue(KIND_PRICED);
    figures.figureFor.mockResolvedValue(figure('bbl', 99));

    const found = await service.sampleStratum({
      source: 'bbl',
      stratumId: STRATUM,
      limit: 1,
    });

    expect(found).toHaveLength(2500);
    expect(history.forPlayers).toHaveBeenCalledTimes(1);
  });

  it('never lists a player whose range is unknown', async () => {
    range.model.mockReturnValue(UNKNOWN);

    expect(
      await service.sampleStratum({
        source: 'bbl',
        stratumId: STRATUM,
        limit: 3,
      }),
    ).toEqual([]);
    expect(figures.figureFor).not.toHaveBeenCalled();
  });

  it('skips a candidate the history load did not return', async () => {
    history.forPlayers.mockResolvedValue(new Map());

    expect(
      await service.sampleStratum({
        source: 'bbl',
        stratumId: STRATUM,
        limit: 3,
      }),
    ).toEqual([]);
    expect(range.model).not.toHaveBeenCalled();
  });

  it('asks only for non-star players with a stored total', async () => {
    range.model.mockReturnValue(UNKNOWN);
    await service.sampleStratum({
      source: 'bbl',
      stratumId: STRATUM,
      limit: 3,
    });

    const where = dbResult.chains[0].where.mock.calls[0][0] as SQL;
    const { sql } = new PgDialect().sqlToQuery(where);
    expect(sql).toContain('"is_star_player" = $1');
    expect(sql).toContain('"spp_total" is not null');
  });

  it('rejects an unknown stratum', async () => {
    await expect(
      service.sampleStratum({ source: 'bbl', stratumId: 'nope', limit: 3 }),
    ).rejects.toThrow('Unknown player stratum "nope"');
  });
});
