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

const KNOWN: UnspentSppModel = {
  rulesSetName: 'CRP',
  fixedThresholds: true,
  rows: [],
  totalSpp: 40,
  range: { spentMin: 31, spentMax: 31, unspentMin: 9, unspentMax: 9 },
  unknownReason: null,
};
const UNKNOWN: UnspentSppModel = {
  ...KNOWN,
  range: null,
  unknownReason: 'no_costs',
};

function figure(unspent: number | null) {
  return {
    unspentLabel: 'BBL Unspent SPP',
    unspent,
    totalLabel: 'BBL career SPP (bracketed)',
    reportedTotal: 40,
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
      ],
    }).compile();
    service = moduleRef.get(UnspentSppOutsideRangeStratificationService);
  }

  beforeEach(async () => {
    await build([row(1)]);
  });

  it('offers one stratum for both sources', () => {
    expect(service.listStrata()).toEqual([
      {
        id: STRATUM,
        label: 'Source unspent SPP outside the modelled range',
        sources: ['bbl', 'tp'],
      },
    ]);
  });

  it('lists every player whose figure is outside, ignoring the limit', async () => {
    await build([row(1), row(2), row(3)]);
    range.model.mockReturnValue(KNOWN);
    figures.figureFor.mockResolvedValue(figure(3));
    range.placement
      .mockReturnValueOnce('below')
      .mockReturnValueOnce('inside')
      .mockReturnValueOnce('above');

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

  it('passes the modelled range and the source figure to the placement check', async () => {
    range.model.mockReturnValue(KNOWN);
    figures.figureFor.mockResolvedValue(figure(9));
    range.placement.mockReturnValue('inside');

    const found = await service.sampleStratum({
      source: 'tp',
      stratumId: STRATUM,
      limit: 3,
    });

    expect(found).toEqual([]);
    expect(range.placement).toHaveBeenCalledWith(9, KNOWN.range);
    expect(figures.figureFor).toHaveBeenCalledWith({
      source: 'tp',
      externalId: '1001',
    });
  });

  it('handles a large candidate set in one history load', async () => {
    const many = Array.from({ length: 2500 }, (_, i) => row(i + 1));
    await build(many);
    range.model.mockReturnValue(KNOWN);
    figures.figureFor.mockResolvedValue(figure(3));
    range.placement.mockReturnValue('above');

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

  it.each([null, figure(null)])(
    'never lists a player with no source figure (%o)',
    async (reported) => {
      range.model.mockReturnValue(KNOWN);
      figures.figureFor.mockResolvedValue(reported);

      expect(
        await service.sampleStratum({
          source: 'tp',
          stratumId: STRATUM,
          limit: 3,
        }),
      ).toEqual([]);
      expect(range.placement).not.toHaveBeenCalled();
    },
  );

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
