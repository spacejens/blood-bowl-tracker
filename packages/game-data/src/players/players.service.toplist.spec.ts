import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import type { QueryChain } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { CharacteristicFormatValidationService } from '../shared/characteristic-format-validation.service';
import { FACT_SCOPE_ALL_TIME } from '../shared/fact-scope';
import { LikePatternService } from '../shared/like-pattern.service';
import { MatchEventCountsService } from '../shared/match-event-counts.service';
import {
  CASUALTY_CAUSED_TYPES,
  CASUALTY_SUFFERED_TYPES,
  COMPLETION_TYPES,
  DEATH_CAUSED_TYPES,
  DEFLECTION_TYPES,
  FOUL_TYPES,
  INTERCEPTION_TYPES,
  LASTING_INJURY_SUFFERED_TYPES,
  MVP_AWARD_TYPES,
  SENT_OFF_TYPES,
  SERIOUS_INJURY_CAUSED_TYPES,
  SERIOUS_INJURY_SUFFERED_TYPES,
  TOUCHDOWN_TYPES,
} from '../shared/match-event-types';
import { PlayerContextNamesService } from '../shared/player-context-names.service';
import {
  extractAllFilterValues,
  extractJoinColumns,
  firstCallArg,
  sqlText,
} from '../shared/query-assertions.test-helpers';
import { SppTotalsService } from '../spp/spp-totals.service';
import { PlayerDeepdiveCountsService } from './player-deepdive-counts.service';
import { PlayersService } from './players.service';

describe('PlayersService toplist queries', () => {
  let service: PlayersService;
  let likePattern: MockProxy<LikePatternService>;
  let sppTotals: MockProxy<SppTotalsService>;
  let deepdiveCounts: MockProxy<PlayerDeepdiveCountsService>;
  let matchEventCounts: MockProxy<MatchEventCountsService>;
  let playerContextNames: MockProxy<PlayerContextNamesService>;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayersService,
        { provide: LikePatternService, useValue: likePattern },
        { provide: SppTotalsService, useValue: sppTotals },
        { provide: PlayerDeepdiveCountsService, useValue: deepdiveCounts },
        { provide: MatchEventCountsService, useValue: matchEventCounts },
        { provide: PlayerContextNamesService, useValue: playerContextNames },
        CharacteristicFormatValidationService,
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(PlayersService);
    return { db, chains };
  }

  beforeEach(() => {
    likePattern = mock<LikePatternService>();
    sppTotals = mock<SppTotalsService>();
    deepdiveCounts = mock<PlayerDeepdiveCountsService>();
    matchEventCounts = mock<MatchEventCountsService>();
    playerContextNames = mock<PlayerContextNamesService>();
  });

  it.each([
    ['countMvpAwardsByPlayer', 'acting', MVP_AWARD_TYPES],
    ['countTouchdownsScoredByPlayer', 'acting', TOUCHDOWN_TYPES],
    ['countCompletionsByPlayer', 'acting', COMPLETION_TYPES],
    ['countInterceptionsByPlayer', 'acting', INTERCEPTION_TYPES],
    ['countDeflectionsByPlayer', 'acting', DEFLECTION_TYPES],
    ['countCasualtiesCausedByPlayer', 'acting', CASUALTY_CAUSED_TYPES],
    [
      'countSeriousInjuriesCausedByPlayer',
      'acting',
      SERIOUS_INJURY_CAUSED_TYPES,
    ],
    ['countDeathsCausedByPlayer', 'acting', DEATH_CAUSED_TYPES],
    ['countFoulsCommittedByPlayer', 'acting', FOUL_TYPES],
    ['countTimesSentOffByPlayer', 'consequence', SENT_OFF_TYPES],
    ['countCasualtiesSufferedByPlayer', 'consequence', CASUALTY_SUFFERED_TYPES],
    [
      'countSeriousInjuriesSufferedByPlayer',
      'consequence',
      SERIOUS_INJURY_SUFFERED_TYPES,
    ],
    [
      'countLastingInjuriesSufferedByPlayer',
      'consequence',
      LASTING_INJURY_SUFFERED_TYPES,
    ],
  ] as const)(
    '%s asks MatchEventCountsService for its own selector and returns the rows',
    async (method, role, types) => {
      const rows = [
        { playerId: 1, name: 'Griff Oberwald', count: 7 },
        { playerId: 2, name: 'Morg n Thorg', count: 3 },
      ];
      matchEventCounts.countMatchEventsByPlayer.mockResolvedValue(rows);
      await build();

      await expect(service[method](FACT_SCOPE_ALL_TIME, 21)).resolves.toEqual(
        rows,
      );

      expect(matchEventCounts.countMatchEventsByPlayer).toHaveBeenCalledWith({
        selector: { role, types },
        scope: FACT_SCOPE_ALL_TIME,
        limit: 21,
      });
    },
  );

  it('countMvpAwardsByPlayer forwards a non-default scope verbatim', async () => {
    const rows = [{ playerId: 1, name: 'Griff Oberwald', count: 2 }];
    matchEventCounts.countMatchEventsByPlayer.mockResolvedValue(rows);
    await build();

    await expect(
      service.countMvpAwardsByPlayer({ eraId: 20 }, 21),
    ).resolves.toEqual(rows);

    expect(matchEventCounts.countMatchEventsByPlayer).toHaveBeenCalledWith({
      selector: { role: 'acting', types: MVP_AWARD_TYPES },
      scope: { eraId: 20 },
      limit: 21,
    });
  });

  it('topPlayersByTotalSpp ranks by the stored spp_total for the all-time scope', async () => {
    const rows = [
      { playerId: 1, name: 'Griff Oberwald', count: 128 },
      { playerId: 2, name: 'Morg n Thorg', count: 96 },
    ];
    const { db, chains } = await build(rows);

    await expect(
      service.topPlayersByTotalSpp(FACT_SCOPE_ALL_TIME, 21),
    ).resolves.toEqual(rows);
    expect(db.select).toHaveBeenCalledTimes(1);
    expect(sppTotals.topPlayersBySppSum).not.toHaveBeenCalled();
    expect(chains[0].limit).toHaveBeenCalledWith(21);
    // players -> teamEras -> eras -> positions, so a league scope can filter on eras.
    expect(chains[0].innerJoin).toHaveBeenCalledTimes(3);
    expect(extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1))).toEqual(
      ['team_eras.id', 'players.team_era_id'],
    );
    expect(chains[0].orderBy).toHaveBeenCalledTimes(1);
    expect(extractJoinColumns(firstCallArg(chains[0].orderBy))).toEqual([
      'players.spp_total',
    ]);
  });

  it('topPlayersByTotalSpp excludes players with no stored spp_total', async () => {
    const { chains } = await build([]);

    await service.topPlayersByTotalSpp(FACT_SCOPE_ALL_TIME, 21);

    // The IS NOT NULL guard binds no value; the star-player exclusion binds false.
    expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
      false,
    ]);
    expect(extractJoinColumns(firstCallArg(chains[0].where))).toEqual([
      'players.spp_total',
      'positions.is_star_player',
    ]);
  });

  it('topPlayersByTotalSpp excludes star players from the stored-total ranking', async () => {
    const { chains } = await build([]);

    await service.topPlayersByTotalSpp(FACT_SCOPE_ALL_TIME, 21);

    // players -> teamEras -> eras -> positions
    expect(chains[0].innerJoin).toHaveBeenCalledTimes(3);
    expect(extractJoinColumns(firstCallArg(chains[0].innerJoin, 2, 1))).toEqual(
      ['positions.id', 'players.position_id'],
    );
    expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
      false,
    ]);
  });

  it('topPlayersByTotalSpp filters by the era the player record belongs to', async () => {
    const { chains } = await build([]);

    await service.topPlayersByTotalSpp({ eraId: 20 }, 21);

    expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
      20,
      false,
    ]);
  });

  it('topPlayersByTotalSpp filters by league through the player era', async () => {
    const { chains } = await build([]);

    await service.topPlayersByTotalSpp({ leagueId: 9 }, 21);

    expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
      9,
      false,
    ]);
  });

  it('topPlayersByTotalSpp sums match events instead when a competition is scoped', async () => {
    const rows = [{ playerId: 1, name: 'Griff Oberwald', count: 12 }];
    const { db } = await build([]);
    sppTotals.topPlayersBySppSum.mockResolvedValue(rows);

    await expect(
      service.topPlayersByTotalSpp({ competitionId: 30 }, 21),
    ).resolves.toEqual(rows);
    expect(sppTotals.topPlayersBySppSum).toHaveBeenCalledWith(
      { competitionId: 30 },
      21,
    );
    expect(db.select).not.toHaveBeenCalled();
  });

  it('topPlayersByTotalSpp sums match events instead when a match category is scoped', async () => {
    const rows = [{ playerId: 1, name: 'Griff Oberwald', count: 5 }];
    const { db } = await build([]);
    sppTotals.topPlayersBySppSum.mockResolvedValue(rows);

    await expect(
      service.topPlayersByTotalSpp({ category: 'season_final' }, 21),
    ).resolves.toEqual(rows);
    expect(sppTotals.topPlayersBySppSum).toHaveBeenCalledWith(
      { category: 'season_final' },
      21,
    );
    expect(db.select).not.toHaveBeenCalled();
  });

  describe('topPlayersByTotalSppForTeam', () => {
    it('returns the team rows the query resolves to, capped to the limit', async () => {
      const rows = [
        {
          playerId: 5,
          name: 'Griff',
          count: 42,
          positionId: 60,
          positionName: 'Blitzer',
          isStarPlayer: false,
        },
        {
          playerId: 8,
          name: 'Grim',
          count: 17,
          positionId: 61,
          positionName: 'Runner',
          isStarPlayer: false,
        },
      ];
      const { chains } = await build(rows);

      await expect(service.topPlayersByTotalSppForTeam(7, 10)).resolves.toEqual(
        rows,
      );

      expect(chains[0].limit).toHaveBeenCalledWith(10);
    });

    it('scopes to the given team, skips null totals and excludes star players', async () => {
      const { chains } = await build([]);

      await service.topPlayersByTotalSppForTeam(7, 10);

      // The IS NOT NULL guard binds no value; the team id and the star-player
      // exclusion each bind one.
      expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
        7,
        false,
      ]);
      expect(extractJoinColumns(firstCallArg(chains[0].where))).toEqual([
        'players.spp_total',
        'teams.id',
        'positions.is_star_player',
      ]);
    });

    it('reaches the team through the player team-era, so every era counts', async () => {
      const { chains } = await build([]);

      await service.topPlayersByTotalSppForTeam(7, 10);

      // players -> teamEras -> teams -> positions
      expect(chains[0].innerJoin).toHaveBeenCalledTimes(3);
      const joinConditions = chains[0].innerJoin.mock.calls.map((call) =>
        extractJoinColumns(call[1]),
      );
      expect(joinConditions).toEqual([
        ['team_eras.id', 'players.team_era_id'],
        ['teams.id', 'team_eras.team_id'],
        ['positions.id', 'players.position_id'],
      ]);
    });

    it('orders by the stored SPP total descending with no secondary tiebreak', async () => {
      const { chains } = await build([]);

      await service.topPlayersByTotalSppForTeam(7, 10);

      expect(chains[0].orderBy).toHaveBeenCalledTimes(1);
      expect(chains[0].orderBy.mock.calls[0]).toHaveLength(1);
      expect(extractJoinColumns(firstCallArg(chains[0].orderBy))).toEqual([
        'players.spp_total',
      ]);
      expect(sqlText(firstCallArg(chains[0].orderBy))).toContain(' desc');
    });
  });
});
