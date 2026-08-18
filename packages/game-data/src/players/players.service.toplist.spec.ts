import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { QueryChain } from '../shared/db-mock.test-helpers';
import { mockDb } from '../shared/db-mock.test-helpers';
import { FACT_SCOPE_ALL_TIME } from '../shared/fact-scope';
import { LikePatternService } from '../shared/like-pattern.service';
import {
  extractAllFilterValues,
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { SppTotalsService } from '../spp/spp-totals.service';
import { PlayersService } from './players.service';

describe('PlayersService toplist queries', () => {
  let service: PlayersService;
  let likePattern: MockProxy<LikePatternService>;
  let sppTotals: MockProxy<SppTotalsService>;

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
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(PlayersService);
    return { db, chains };
  }

  beforeEach(() => {
    likePattern = mock<LikePatternService>();
    sppTotals = mock<SppTotalsService>();
  });

  it('countMvpAwardsByPlayer returns the rows the query resolves to', async () => {
    const rows = [
      { playerId: 1, name: 'Griff Oberwald', count: 7 },
      { playerId: 2, name: 'Morg n Thorg', count: 3 },
    ];
    const { db } = await build(rows);
    await expect(
      service.countMvpAwardsByPlayer(FACT_SCOPE_ALL_TIME, 21),
    ).resolves.toEqual(rows);
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it('countMvpAwardsByPlayer returns an empty array when there are no rows', async () => {
    await build([]);
    await expect(
      service.countMvpAwardsByPlayer(FACT_SCOPE_ALL_TIME, 21),
    ).resolves.toEqual([]);
  });

  it('countMvpAwardsByPlayer preserves tie ordering from the query', async () => {
    const rows = [
      { playerId: 1, name: 'Griff Oberwald', count: 5 },
      { playerId: 2, name: 'Morg n Thorg', count: 5 },
      { playerId: 3, name: 'Zug', count: 2 },
    ];
    await build(rows);
    await expect(
      service.countMvpAwardsByPlayer(FACT_SCOPE_ALL_TIME, 21),
    ).resolves.toEqual(rows);
  });

  it('countMvpAwardsByPlayer adds an era filter when an eraId is given', async () => {
    const rows = [{ playerId: 1, name: 'Griff Oberwald', count: 2 }];
    const { chains } = await build(rows);
    await expect(
      service.countMvpAwardsByPlayer({ eraId: 20 }, 21),
    ).resolves.toEqual(rows);
    // The where() call is always present; the era clause is folded into it.
    expect(chains[0].where).toHaveBeenCalledTimes(1);
    expect(chains[0].limit).toHaveBeenCalledWith(21);
    expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
      'mvp_award',
      20,
      false,
    ]);
  });

  it('countMvpAwardsByPlayer joins matches and filters by competition when a competitionId is given', async () => {
    const { chains } = await build([]);
    await service.countMvpAwardsByPlayer({ competitionId: 30 }, 21);
    expect(chains[0].innerJoin).toHaveBeenCalledTimes(6);
    expect(extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1))).toEqual(
      ['players.id', 'match_events.acting_player_id'],
    );
    expect(chains[0].where).toHaveBeenCalledTimes(1);
    expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
      'mvp_award',
      30,
      false,
    ]);
  });

  it('countTouchdownsScoredByPlayer returns the rows the query resolves to', async () => {
    const rows = [{ playerId: 1, name: 'Griff Oberwald', count: 9 }];
    const { db } = await build(rows);
    await expect(
      service.countTouchdownsScoredByPlayer(FACT_SCOPE_ALL_TIME, 21),
    ).resolves.toEqual(rows);
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it('countTouchdownsScoredByPlayer adds an era filter when an eraId is given', async () => {
    const { chains } = await build([]);
    await service.countTouchdownsScoredByPlayer({ eraId: 20 }, 21);
    expect(chains[0].where).toHaveBeenCalledTimes(1);
    expect(chains[0].limit).toHaveBeenCalledWith(21);
    expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
      'touchdown',
      20,
      false,
    ]);
  });

  it('countTouchdownsScoredByPlayer joins matches and filters by competition when a competitionId is given', async () => {
    const { chains } = await build([]);
    await service.countTouchdownsScoredByPlayer({ competitionId: 30 }, 21);
    expect(chains[0].innerJoin).toHaveBeenCalledTimes(6);
    expect(extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1))).toEqual(
      ['players.id', 'match_events.acting_player_id'],
    );
    expect(chains[0].where).toHaveBeenCalledTimes(1);
    expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
      'touchdown',
      30,
      false,
    ]);
  });

  it('countCompletionsByPlayer returns the rows the query resolves to', async () => {
    const rows = [{ playerId: 1, name: 'Griff Oberwald', count: 6 }];
    await build(rows);
    await expect(
      service.countCompletionsByPlayer(FACT_SCOPE_ALL_TIME, 21),
    ).resolves.toEqual(rows);
  });

  it('countCompletionsByPlayer adds an era filter when an eraId is given', async () => {
    const { chains } = await build([]);
    await service.countCompletionsByPlayer({ eraId: 20 }, 21);
    expect(chains[0].where).toHaveBeenCalledTimes(1);
    expect(chains[0].limit).toHaveBeenCalledWith(21);
    expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
      'completion',
      20,
      false,
    ]);
  });

  it('countCompletionsByPlayer joins matches and filters by competition when a competitionId is given', async () => {
    const { chains } = await build([]);
    await service.countCompletionsByPlayer({ competitionId: 30 }, 21);
    expect(chains[0].innerJoin).toHaveBeenCalledTimes(6);
    expect(extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1))).toEqual(
      ['players.id', 'match_events.acting_player_id'],
    );
    expect(chains[0].where).toHaveBeenCalledTimes(1);
    expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
      'completion',
      30,
      false,
    ]);
  });

  it('countInterceptionsByPlayer returns the rows the query resolves to', async () => {
    const rows = [{ playerId: 1, name: 'Griff Oberwald', count: 4 }];
    await build(rows);
    await expect(
      service.countInterceptionsByPlayer(FACT_SCOPE_ALL_TIME, 21),
    ).resolves.toEqual(rows);
  });

  it('countInterceptionsByPlayer adds an era filter when an eraId is given', async () => {
    const { chains } = await build([]);
    await service.countInterceptionsByPlayer({ eraId: 20 }, 21);
    expect(chains[0].where).toHaveBeenCalledTimes(1);
    expect(chains[0].limit).toHaveBeenCalledWith(21);
    expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
      'interception',
      20,
      false,
    ]);
  });

  it('countInterceptionsByPlayer joins matches and filters by competition when a competitionId is given', async () => {
    const { chains } = await build([]);
    await service.countInterceptionsByPlayer({ competitionId: 30 }, 21);
    expect(chains[0].innerJoin).toHaveBeenCalledTimes(6);
    expect(extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1))).toEqual(
      ['players.id', 'match_events.acting_player_id'],
    );
    expect(chains[0].where).toHaveBeenCalledTimes(1);
    expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
      'interception',
      30,
      false,
    ]);
  });

  it('countDeflectionsByPlayer returns the rows the query resolves to', async () => {
    const rows = [{ playerId: 1, name: 'Griff Oberwald', count: 3 }];
    await build(rows);
    await expect(
      service.countDeflectionsByPlayer(FACT_SCOPE_ALL_TIME, 21),
    ).resolves.toEqual(rows);
  });

  it('countDeflectionsByPlayer adds an era filter when an eraId is given', async () => {
    const { chains } = await build([]);
    await service.countDeflectionsByPlayer({ eraId: 20 }, 21);
    expect(chains[0].where).toHaveBeenCalledTimes(1);
    expect(chains[0].limit).toHaveBeenCalledWith(21);
    expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
      'deflection',
      20,
      false,
    ]);
  });

  it('countDeflectionsByPlayer joins matches and filters by competition when a competitionId is given', async () => {
    const { chains } = await build([]);
    await service.countDeflectionsByPlayer({ competitionId: 30 }, 21);
    expect(chains[0].innerJoin).toHaveBeenCalledTimes(6);
    expect(extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1))).toEqual(
      ['players.id', 'match_events.acting_player_id'],
    );
    expect(chains[0].where).toHaveBeenCalledTimes(1);
    expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
      'deflection',
      30,
      false,
    ]);
  });

  it('countCasualtiesCausedByPlayer returns the rows the query resolves to', async () => {
    const rows = [
      { playerId: 1, name: 'Morg n Thorg', count: 11 },
      { playerId: 2, name: 'Griff Oberwald', count: 4 },
    ];
    const { db } = await build(rows);
    await expect(
      service.countCasualtiesCausedByPlayer(FACT_SCOPE_ALL_TIME, 21),
    ).resolves.toEqual(rows);
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it('countCasualtiesCausedByPlayer adds an era filter when an eraId is given', async () => {
    const { chains } = await build([]);
    await service.countCasualtiesCausedByPlayer({ eraId: 20 }, 21);
    expect(chains[0].where).toHaveBeenCalledTimes(1);
    expect(chains[0].limit).toHaveBeenCalledWith(21);
    expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
      'casualty',
      'badly_hurt',
      'serious_injury',
      'death',
      20,
      false,
    ]);
  });

  it('countCasualtiesCausedByPlayer joins matches and filters by competition when a competitionId is given', async () => {
    const { chains } = await build([]);
    await service.countCasualtiesCausedByPlayer({ competitionId: 30 }, 21);
    expect(chains[0].innerJoin).toHaveBeenCalledTimes(6);
    expect(extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1))).toEqual(
      ['players.id', 'match_events.acting_player_id'],
    );
    expect(chains[0].where).toHaveBeenCalledTimes(1);
    expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
      'casualty',
      'badly_hurt',
      'serious_injury',
      'death',
      30,
      false,
    ]);
  });

  it('countSeriousInjuriesCausedByPlayer returns the rows the query resolves to', async () => {
    const rows = [{ playerId: 1, name: 'Morg n Thorg', count: 3 }];
    await build(rows);
    await expect(
      service.countSeriousInjuriesCausedByPlayer(FACT_SCOPE_ALL_TIME, 21),
    ).resolves.toEqual(rows);
  });

  it('countSeriousInjuriesCausedByPlayer adds an era filter when an eraId is given', async () => {
    const { chains } = await build([]);
    await service.countSeriousInjuriesCausedByPlayer({ eraId: 20 }, 21);
    expect(chains[0].where).toHaveBeenCalledTimes(1);
    expect(chains[0].limit).toHaveBeenCalledWith(21);
    expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
      'serious_injury',
      20,
      false,
    ]);
  });

  it('countSeriousInjuriesCausedByPlayer joins matches and filters by competition when a competitionId is given', async () => {
    const { chains } = await build([]);
    await service.countSeriousInjuriesCausedByPlayer({ competitionId: 30 }, 21);
    expect(chains[0].innerJoin).toHaveBeenCalledTimes(6);
    expect(extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1))).toEqual(
      ['players.id', 'match_events.acting_player_id'],
    );
    expect(chains[0].where).toHaveBeenCalledTimes(1);
    expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
      'serious_injury',
      30,
      false,
    ]);
  });

  it('countDeathsCausedByPlayer returns the rows the query resolves to', async () => {
    const rows = [{ playerId: 1, name: 'Morg n Thorg', count: 2 }];
    await build(rows);
    await expect(
      service.countDeathsCausedByPlayer(FACT_SCOPE_ALL_TIME, 21),
    ).resolves.toEqual(rows);
  });

  it('countDeathsCausedByPlayer adds an era filter when an eraId is given', async () => {
    const { chains } = await build([]);
    await service.countDeathsCausedByPlayer({ eraId: 20 }, 21);
    expect(chains[0].where).toHaveBeenCalledTimes(1);
    expect(chains[0].limit).toHaveBeenCalledWith(21);
    expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
      'death',
      20,
      false,
    ]);
  });

  it('countDeathsCausedByPlayer joins matches and filters by competition when a competitionId is given', async () => {
    const { chains } = await build([]);
    await service.countDeathsCausedByPlayer({ competitionId: 30 }, 21);
    expect(chains[0].innerJoin).toHaveBeenCalledTimes(6);
    expect(extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1))).toEqual(
      ['players.id', 'match_events.acting_player_id'],
    );
    expect(chains[0].where).toHaveBeenCalledTimes(1);
    expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
      'death',
      30,
      false,
    ]);
  });

  it('countFoulsCommittedByPlayer returns the rows the query resolves to', async () => {
    const rows = [{ playerId: 1, name: 'Morg n Thorg', count: 6 }];
    await build(rows);
    await expect(
      service.countFoulsCommittedByPlayer(FACT_SCOPE_ALL_TIME, 21),
    ).resolves.toEqual(rows);
  });

  it('countFoulsCommittedByPlayer adds an era filter when an eraId is given', async () => {
    const { chains } = await build([]);
    await service.countFoulsCommittedByPlayer({ eraId: 20 }, 21);
    expect(chains[0].where).toHaveBeenCalledTimes(1);
    expect(chains[0].limit).toHaveBeenCalledWith(21);
    expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
      'foul',
      20,
      false,
    ]);
  });

  it('countFoulsCommittedByPlayer joins matches and filters by competition when a competitionId is given', async () => {
    const { chains } = await build([]);
    await service.countFoulsCommittedByPlayer({ competitionId: 30 }, 21);
    expect(chains[0].innerJoin).toHaveBeenCalledTimes(6);
    expect(extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1))).toEqual(
      ['players.id', 'match_events.acting_player_id'],
    );
    expect(chains[0].where).toHaveBeenCalledTimes(1);
    expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
      'foul',
      30,
      false,
    ]);
  });

  it('countTimesSentOffByPlayer returns the rows the query resolves to', async () => {
    const rows = [{ playerId: 1, name: 'Morg n Thorg', count: 5 }];
    await build(rows);
    await expect(
      service.countTimesSentOffByPlayer(FACT_SCOPE_ALL_TIME, 21),
    ).resolves.toEqual(rows);
  });

  it('countTimesSentOffByPlayer adds an era filter when an eraId is given', async () => {
    const { chains } = await build([]);
    await service.countTimesSentOffByPlayer({ eraId: 20 }, 21);
    expect(chains[0].where).toHaveBeenCalledTimes(1);
    expect(chains[0].limit).toHaveBeenCalledWith(21);
    expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
      'sent_off',
      20,
      false,
    ]);
  });

  it('countTimesSentOffByPlayer joins matches and filters by competition when a competitionId is given', async () => {
    const { chains } = await build([]);
    await service.countTimesSentOffByPlayer({ competitionId: 30 }, 21);
    expect(chains[0].innerJoin).toHaveBeenCalledTimes(6);
    expect(extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1))).toEqual(
      ['players.id', 'match_events.consequence_player_id'],
    );
    expect(chains[0].where).toHaveBeenCalledTimes(1);
    expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
      'sent_off',
      30,
      false,
    ]);
  });

  it('countCasualtiesSufferedByPlayer returns the rows the query resolves to', async () => {
    const rows = [
      { playerId: 1, name: 'Griff Oberwald', count: 9 },
      { playerId: 2, name: 'Zug', count: 4 },
    ];
    const { db } = await build(rows);
    await expect(
      service.countCasualtiesSufferedByPlayer(FACT_SCOPE_ALL_TIME, 21),
    ).resolves.toEqual(rows);
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it('countCasualtiesSufferedByPlayer adds an era filter when an eraId is given', async () => {
    const { chains } = await build([]);
    await service.countCasualtiesSufferedByPlayer({ eraId: 20 }, 21);
    expect(chains[0].where).toHaveBeenCalledTimes(1);
    expect(chains[0].limit).toHaveBeenCalledWith(21);
    expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
      'casualty',
      'badly_hurt',
      'death',
      'serious_injury',
      'niggling_injury',
      'miss_next_game',
      'stat_reduction_ma',
      'stat_reduction_st',
      'stat_reduction_ag',
      'stat_reduction_av',
      'stat_reduction_pa',
      20,
      false,
    ]);
  });

  it('countCasualtiesSufferedByPlayer filters on the full casualty-suffered consequence type list', async () => {
    const { chains } = await build([]);
    await service.countCasualtiesSufferedByPlayer(FACT_SCOPE_ALL_TIME, 21);
    const condition = firstCallArg(chains[0].where);
    expect(extractFilterValues(condition)).toEqual([
      'casualty',
      'badly_hurt',
      'death',
      'serious_injury',
      'niggling_injury',
      'miss_next_game',
      'stat_reduction_ma',
      'stat_reduction_st',
      'stat_reduction_ag',
      'stat_reduction_av',
      'stat_reduction_pa',
    ]);
  });

  it('countCasualtiesSufferedByPlayer joins matches and filters by competition when a competitionId is given', async () => {
    const { chains } = await build([]);
    await service.countCasualtiesSufferedByPlayer({ competitionId: 30 }, 21);
    expect(chains[0].innerJoin).toHaveBeenCalledTimes(6);
    expect(extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1))).toEqual(
      ['players.id', 'match_events.consequence_player_id'],
    );
    expect(chains[0].where).toHaveBeenCalledTimes(1);
    expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
      'casualty',
      'badly_hurt',
      'death',
      'serious_injury',
      'niggling_injury',
      'miss_next_game',
      'stat_reduction_ma',
      'stat_reduction_st',
      'stat_reduction_ag',
      'stat_reduction_av',
      'stat_reduction_pa',
      30,
      false,
    ]);
  });

  it('countSeriousInjuriesSufferedByPlayer returns the rows the query resolves to', async () => {
    const rows = [{ playerId: 1, name: 'Griff Oberwald', count: 5 }];
    await build(rows);
    await expect(
      service.countSeriousInjuriesSufferedByPlayer(FACT_SCOPE_ALL_TIME, 21),
    ).resolves.toEqual(rows);
  });

  it('countSeriousInjuriesSufferedByPlayer adds an era filter when an eraId is given', async () => {
    const { chains } = await build([]);
    await service.countSeriousInjuriesSufferedByPlayer({ eraId: 20 }, 21);
    expect(chains[0].where).toHaveBeenCalledTimes(1);
    expect(chains[0].limit).toHaveBeenCalledWith(21);
    expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
      'serious_injury',
      'niggling_injury',
      'miss_next_game',
      'stat_reduction_ma',
      'stat_reduction_st',
      'stat_reduction_ag',
      'stat_reduction_av',
      'stat_reduction_pa',
      20,
      false,
    ]);
  });

  it('countSeriousInjuriesSufferedByPlayer filters on the serious-injury-suffered consequence type list', async () => {
    const { chains } = await build([]);
    await service.countSeriousInjuriesSufferedByPlayer(FACT_SCOPE_ALL_TIME, 21);
    const condition = firstCallArg(chains[0].where);
    expect(extractFilterValues(condition)).toEqual([
      'serious_injury',
      'niggling_injury',
      'miss_next_game',
      'stat_reduction_ma',
      'stat_reduction_st',
      'stat_reduction_ag',
      'stat_reduction_av',
      'stat_reduction_pa',
    ]);
  });

  it('countSeriousInjuriesSufferedByPlayer joins matches and filters by competition when a competitionId is given', async () => {
    const { chains } = await build([]);
    await service.countSeriousInjuriesSufferedByPlayer(
      { competitionId: 30 },
      21,
    );
    expect(chains[0].innerJoin).toHaveBeenCalledTimes(6);
    expect(extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1))).toEqual(
      ['players.id', 'match_events.consequence_player_id'],
    );
    expect(chains[0].where).toHaveBeenCalledTimes(1);
    expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
      'serious_injury',
      'niggling_injury',
      'miss_next_game',
      'stat_reduction_ma',
      'stat_reduction_st',
      'stat_reduction_ag',
      'stat_reduction_av',
      'stat_reduction_pa',
      30,
      false,
    ]);
  });

  it('countLastingInjuriesSufferedByPlayer returns the rows the query resolves to', async () => {
    const rows = [{ playerId: 1, name: 'Griff Oberwald', count: 3 }];
    await build(rows);
    await expect(
      service.countLastingInjuriesSufferedByPlayer(FACT_SCOPE_ALL_TIME, 21),
    ).resolves.toEqual(rows);
  });

  it('countLastingInjuriesSufferedByPlayer adds an era filter when an eraId is given', async () => {
    const { chains } = await build([]);
    await service.countLastingInjuriesSufferedByPlayer({ eraId: 20 }, 21);
    expect(chains[0].where).toHaveBeenCalledTimes(1);
    expect(chains[0].limit).toHaveBeenCalledWith(21);
    expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
      'niggling_injury',
      'stat_reduction_ma',
      'stat_reduction_st',
      'stat_reduction_ag',
      'stat_reduction_av',
      'stat_reduction_pa',
      20,
      false,
    ]);
  });

  it('countLastingInjuriesSufferedByPlayer filters on the lasting-injury-suffered consequence type list', async () => {
    const { chains } = await build([]);
    await service.countLastingInjuriesSufferedByPlayer(FACT_SCOPE_ALL_TIME, 21);
    const condition = firstCallArg(chains[0].where);
    expect(extractFilterValues(condition)).toEqual([
      'niggling_injury',
      'stat_reduction_ma',
      'stat_reduction_st',
      'stat_reduction_ag',
      'stat_reduction_av',
      'stat_reduction_pa',
    ]);
  });

  it('countLastingInjuriesSufferedByPlayer joins matches and filters by competition when a competitionId is given', async () => {
    const { chains } = await build([]);
    await service.countLastingInjuriesSufferedByPlayer(
      { competitionId: 30 },
      21,
    );
    expect(chains[0].innerJoin).toHaveBeenCalledTimes(6);
    expect(extractJoinColumns(firstCallArg(chains[0].innerJoin, 0, 1))).toEqual(
      ['players.id', 'match_events.consequence_player_id'],
    );
    expect(chains[0].where).toHaveBeenCalledTimes(1);
    expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
      'niggling_injury',
      'stat_reduction_ma',
      'stat_reduction_st',
      'stat_reduction_ag',
      'stat_reduction_av',
      'stat_reduction_pa',
      30,
      false,
    ]);
  });

  it('countTouchdownsScoredByPlayer filters by league', async () => {
    const { chains } = await build([]);
    await service.countTouchdownsScoredByPlayer({ leagueId: 9 }, 21);
    expect(chains[0].where).toHaveBeenCalledTimes(1);
    expect(chains[0].innerJoin).toHaveBeenCalledTimes(6);
    expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
      'touchdown',
      9,
      false,
    ]);
  });

  it('countTouchdownsScoredByPlayer joins positions and excludes star players', async () => {
    const { chains } = await build([]);
    await service.countTouchdownsScoredByPlayer(FACT_SCOPE_ALL_TIME, 21);
    expect(chains[0].innerJoin).toHaveBeenCalledTimes(6);
    expect(extractJoinColumns(firstCallArg(chains[0].innerJoin, 5, 1))).toEqual(
      ['positions.id', 'players.position_id'],
    );
    expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([
      'touchdown',
      false,
    ]);
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
    // players -> teamEras -> eras, so a league scope can filter on eras.
    expect(chains[0].innerJoin).toHaveBeenCalledTimes(2);
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

    expect(chains[0].where).toHaveBeenCalledTimes(1);
    // The only clause is the IS NOT NULL guard, which binds no value.
    expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([]);
    expect(extractJoinColumns(firstCallArg(chains[0].where))).toEqual([
      'players.spp_total',
    ]);
  });

  it('topPlayersByTotalSpp filters by the era the player record belongs to', async () => {
    const { chains } = await build([]);

    await service.topPlayersByTotalSpp({ eraId: 20 }, 21);

    expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([20]);
  });

  it('topPlayersByTotalSpp filters by league through the player era', async () => {
    const { chains } = await build([]);

    await service.topPlayersByTotalSpp({ leagueId: 9 }, 21);

    expect(extractAllFilterValues(firstCallArg(chains[0].where))).toEqual([9]);
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
});
