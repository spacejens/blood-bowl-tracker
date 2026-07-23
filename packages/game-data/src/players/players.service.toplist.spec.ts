import type { Db } from '@blood-bowl-tracker/db';
import { describe, expect, it, vi } from 'vitest';

import { FACT_SCOPE_ALL_TIME } from '../shared/fact-scope';
import { LikePatternService } from '../shared/like-pattern.service';
import {
  extractAllFilterValues,
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { PlayersService } from './players.service';

describe('PlayersService toplist queries', () => {
  const likePattern = new LikePatternService();

  function makeQueryBuilder(rows: unknown[]) {
    const builder: Record<string, unknown> = {};
    builder.from = vi.fn(() => builder);
    builder.innerJoin = vi.fn(() => builder);
    builder.where = vi.fn(() => builder);
    builder.groupBy = vi.fn(() => builder);
    builder.orderBy = vi.fn(() => builder);
    builder.limit = vi.fn(() => builder);
    builder.then = (
      resolve: (v: unknown) => unknown,
      reject: (e: unknown) => unknown,
    ) => Promise.resolve(rows).then(resolve, reject);
    return builder;
  }

  it('countMvpAwardsByPlayer returns the rows the query resolves to', async () => {
    const rows = [
      { playerId: 1, name: 'Griff Oberwald', count: 7 },
      { playerId: 2, name: 'Morg n Thorg', count: 3 },
    ];
    const select = vi.fn(() => makeQueryBuilder(rows));
    const service = new PlayersService(
      { select } as unknown as Db,
      likePattern,
    );
    await expect(
      service.countMvpAwardsByPlayer(FACT_SCOPE_ALL_TIME, 21),
    ).resolves.toEqual(rows);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('countMvpAwardsByPlayer returns an empty array when there are no rows', async () => {
    const select = vi.fn(() => makeQueryBuilder([]));
    const service = new PlayersService(
      { select } as unknown as Db,
      likePattern,
    );
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
    const select = vi.fn(() => makeQueryBuilder(rows));
    const service = new PlayersService(
      { select } as unknown as Db,
      likePattern,
    );
    await expect(
      service.countMvpAwardsByPlayer(FACT_SCOPE_ALL_TIME, 21),
    ).resolves.toEqual(rows);
  });

  it('countMvpAwardsByPlayer adds an era filter when an eraId is given', async () => {
    const rows = [{ playerId: 1, name: 'Griff Oberwald', count: 2 }];
    const builder = makeQueryBuilder(rows);
    const select = vi.fn(() => builder);
    const service = new PlayersService(
      { select } as unknown as Db,
      likePattern,
    );
    await expect(
      service.countMvpAwardsByPlayer({ eraId: 20 }, 21),
    ).resolves.toEqual(rows);
    // The where() call is always present; the era clause is folded into it.
    expect(builder.where).toHaveBeenCalledTimes(1);
    expect(builder.limit).toHaveBeenCalledWith(21);
    expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
      'mvp_award',
      20,
    ]);
  });

  it('countMvpAwardsByPlayer joins matches and filters by competition when a competitionId is given', async () => {
    const builder = makeQueryBuilder([]);
    const service = new PlayersService(
      {
        select: vi.fn(() => builder),
      } as unknown as Db,
      likePattern,
    );
    await service.countMvpAwardsByPlayer({ competitionId: 30 }, 21);
    expect(builder.innerJoin).toHaveBeenCalledTimes(5);
    expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual([
      'players.id',
      'match_events.acting_player_id',
    ]);
    expect(builder.where).toHaveBeenCalledTimes(1);
    expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
      'mvp_award',
      30,
    ]);
  });

  it('countTouchdownsScoredByPlayer returns the rows the query resolves to', async () => {
    const rows = [{ playerId: 1, name: 'Griff Oberwald', count: 9 }];
    const select = vi.fn(() => makeQueryBuilder(rows));
    const service = new PlayersService(
      { select } as unknown as Db,
      likePattern,
    );
    await expect(
      service.countTouchdownsScoredByPlayer(FACT_SCOPE_ALL_TIME, 21),
    ).resolves.toEqual(rows);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('countTouchdownsScoredByPlayer adds an era filter when an eraId is given', async () => {
    const builder = makeQueryBuilder([]);
    const service = new PlayersService(
      {
        select: vi.fn(() => builder),
      } as unknown as Db,
      likePattern,
    );
    await service.countTouchdownsScoredByPlayer({ eraId: 20 }, 21);
    expect(builder.where).toHaveBeenCalledTimes(1);
    expect(builder.limit).toHaveBeenCalledWith(21);
    expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
      'touchdown',
      20,
    ]);
  });

  it('countTouchdownsScoredByPlayer joins matches and filters by competition when a competitionId is given', async () => {
    const builder = makeQueryBuilder([]);
    const service = new PlayersService(
      {
        select: vi.fn(() => builder),
      } as unknown as Db,
      likePattern,
    );
    await service.countTouchdownsScoredByPlayer({ competitionId: 30 }, 21);
    expect(builder.innerJoin).toHaveBeenCalledTimes(5);
    expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual([
      'players.id',
      'match_events.acting_player_id',
    ]);
    expect(builder.where).toHaveBeenCalledTimes(1);
    expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
      'touchdown',
      30,
    ]);
  });

  it('countCompletionsByPlayer returns the rows the query resolves to', async () => {
    const rows = [{ playerId: 1, name: 'Griff Oberwald', count: 6 }];
    const select = vi.fn(() => makeQueryBuilder(rows));
    const service = new PlayersService(
      { select } as unknown as Db,
      likePattern,
    );
    await expect(
      service.countCompletionsByPlayer(FACT_SCOPE_ALL_TIME, 21),
    ).resolves.toEqual(rows);
  });

  it('countCompletionsByPlayer adds an era filter when an eraId is given', async () => {
    const builder = makeQueryBuilder([]);
    const service = new PlayersService(
      {
        select: vi.fn(() => builder),
      } as unknown as Db,
      likePattern,
    );
    await service.countCompletionsByPlayer({ eraId: 20 }, 21);
    expect(builder.where).toHaveBeenCalledTimes(1);
    expect(builder.limit).toHaveBeenCalledWith(21);
    expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
      'completion',
      20,
    ]);
  });

  it('countCompletionsByPlayer joins matches and filters by competition when a competitionId is given', async () => {
    const builder = makeQueryBuilder([]);
    const service = new PlayersService(
      {
        select: vi.fn(() => builder),
      } as unknown as Db,
      likePattern,
    );
    await service.countCompletionsByPlayer({ competitionId: 30 }, 21);
    expect(builder.innerJoin).toHaveBeenCalledTimes(5);
    expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual([
      'players.id',
      'match_events.acting_player_id',
    ]);
    expect(builder.where).toHaveBeenCalledTimes(1);
    expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
      'completion',
      30,
    ]);
  });

  it('countInterceptionsByPlayer returns the rows the query resolves to', async () => {
    const rows = [{ playerId: 1, name: 'Griff Oberwald', count: 4 }];
    const select = vi.fn(() => makeQueryBuilder(rows));
    const service = new PlayersService(
      { select } as unknown as Db,
      likePattern,
    );
    await expect(
      service.countInterceptionsByPlayer(FACT_SCOPE_ALL_TIME, 21),
    ).resolves.toEqual(rows);
  });

  it('countInterceptionsByPlayer adds an era filter when an eraId is given', async () => {
    const builder = makeQueryBuilder([]);
    const service = new PlayersService(
      {
        select: vi.fn(() => builder),
      } as unknown as Db,
      likePattern,
    );
    await service.countInterceptionsByPlayer({ eraId: 20 }, 21);
    expect(builder.where).toHaveBeenCalledTimes(1);
    expect(builder.limit).toHaveBeenCalledWith(21);
    expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
      'interception',
      20,
    ]);
  });

  it('countInterceptionsByPlayer joins matches and filters by competition when a competitionId is given', async () => {
    const builder = makeQueryBuilder([]);
    const service = new PlayersService(
      {
        select: vi.fn(() => builder),
      } as unknown as Db,
      likePattern,
    );
    await service.countInterceptionsByPlayer({ competitionId: 30 }, 21);
    expect(builder.innerJoin).toHaveBeenCalledTimes(5);
    expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual([
      'players.id',
      'match_events.acting_player_id',
    ]);
    expect(builder.where).toHaveBeenCalledTimes(1);
    expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
      'interception',
      30,
    ]);
  });

  it('countDeflectionsByPlayer returns the rows the query resolves to', async () => {
    const rows = [{ playerId: 1, name: 'Griff Oberwald', count: 3 }];
    const select = vi.fn(() => makeQueryBuilder(rows));
    const service = new PlayersService(
      { select } as unknown as Db,
      likePattern,
    );
    await expect(
      service.countDeflectionsByPlayer(FACT_SCOPE_ALL_TIME, 21),
    ).resolves.toEqual(rows);
  });

  it('countDeflectionsByPlayer adds an era filter when an eraId is given', async () => {
    const builder = makeQueryBuilder([]);
    const service = new PlayersService(
      {
        select: vi.fn(() => builder),
      } as unknown as Db,
      likePattern,
    );
    await service.countDeflectionsByPlayer({ eraId: 20 }, 21);
    expect(builder.where).toHaveBeenCalledTimes(1);
    expect(builder.limit).toHaveBeenCalledWith(21);
    expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
      'deflection',
      20,
    ]);
  });

  it('countDeflectionsByPlayer joins matches and filters by competition when a competitionId is given', async () => {
    const builder = makeQueryBuilder([]);
    const service = new PlayersService(
      {
        select: vi.fn(() => builder),
      } as unknown as Db,
      likePattern,
    );
    await service.countDeflectionsByPlayer({ competitionId: 30 }, 21);
    expect(builder.innerJoin).toHaveBeenCalledTimes(5);
    expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual([
      'players.id',
      'match_events.acting_player_id',
    ]);
    expect(builder.where).toHaveBeenCalledTimes(1);
    expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
      'deflection',
      30,
    ]);
  });

  it('countCasualtiesCausedByPlayer returns the rows the query resolves to', async () => {
    const rows = [
      { playerId: 1, name: 'Morg n Thorg', count: 11 },
      { playerId: 2, name: 'Griff Oberwald', count: 4 },
    ];
    const select = vi.fn(() => makeQueryBuilder(rows));
    const service = new PlayersService(
      { select } as unknown as Db,
      likePattern,
    );
    await expect(
      service.countCasualtiesCausedByPlayer(FACT_SCOPE_ALL_TIME, 21),
    ).resolves.toEqual(rows);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('countCasualtiesCausedByPlayer adds an era filter when an eraId is given', async () => {
    const builder = makeQueryBuilder([]);
    const service = new PlayersService(
      {
        select: vi.fn(() => builder),
      } as unknown as Db,
      likePattern,
    );
    await service.countCasualtiesCausedByPlayer({ eraId: 20 }, 21);
    expect(builder.where).toHaveBeenCalledTimes(1);
    expect(builder.limit).toHaveBeenCalledWith(21);
    expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
      'casualty',
      'badly_hurt',
      'serious_injury',
      'death',
      20,
    ]);
  });

  it('countCasualtiesCausedByPlayer joins matches and filters by competition when a competitionId is given', async () => {
    const builder = makeQueryBuilder([]);
    const service = new PlayersService(
      {
        select: vi.fn(() => builder),
      } as unknown as Db,
      likePattern,
    );
    await service.countCasualtiesCausedByPlayer({ competitionId: 30 }, 21);
    expect(builder.innerJoin).toHaveBeenCalledTimes(5);
    expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual([
      'players.id',
      'match_events.acting_player_id',
    ]);
    expect(builder.where).toHaveBeenCalledTimes(1);
    expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
      'casualty',
      'badly_hurt',
      'serious_injury',
      'death',
      30,
    ]);
  });

  it('countSeriousInjuriesCausedByPlayer returns the rows the query resolves to', async () => {
    const rows = [{ playerId: 1, name: 'Morg n Thorg', count: 3 }];
    const select = vi.fn(() => makeQueryBuilder(rows));
    const service = new PlayersService(
      { select } as unknown as Db,
      likePattern,
    );
    await expect(
      service.countSeriousInjuriesCausedByPlayer(FACT_SCOPE_ALL_TIME, 21),
    ).resolves.toEqual(rows);
  });

  it('countSeriousInjuriesCausedByPlayer adds an era filter when an eraId is given', async () => {
    const builder = makeQueryBuilder([]);
    const service = new PlayersService(
      {
        select: vi.fn(() => builder),
      } as unknown as Db,
      likePattern,
    );
    await service.countSeriousInjuriesCausedByPlayer({ eraId: 20 }, 21);
    expect(builder.where).toHaveBeenCalledTimes(1);
    expect(builder.limit).toHaveBeenCalledWith(21);
    expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
      'serious_injury',
      20,
    ]);
  });

  it('countSeriousInjuriesCausedByPlayer joins matches and filters by competition when a competitionId is given', async () => {
    const builder = makeQueryBuilder([]);
    const service = new PlayersService(
      {
        select: vi.fn(() => builder),
      } as unknown as Db,
      likePattern,
    );
    await service.countSeriousInjuriesCausedByPlayer({ competitionId: 30 }, 21);
    expect(builder.innerJoin).toHaveBeenCalledTimes(5);
    expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual([
      'players.id',
      'match_events.acting_player_id',
    ]);
    expect(builder.where).toHaveBeenCalledTimes(1);
    expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
      'serious_injury',
      30,
    ]);
  });

  it('countDeathsCausedByPlayer returns the rows the query resolves to', async () => {
    const rows = [{ playerId: 1, name: 'Morg n Thorg', count: 2 }];
    const select = vi.fn(() => makeQueryBuilder(rows));
    const service = new PlayersService(
      { select } as unknown as Db,
      likePattern,
    );
    await expect(
      service.countDeathsCausedByPlayer(FACT_SCOPE_ALL_TIME, 21),
    ).resolves.toEqual(rows);
  });

  it('countDeathsCausedByPlayer adds an era filter when an eraId is given', async () => {
    const builder = makeQueryBuilder([]);
    const service = new PlayersService(
      {
        select: vi.fn(() => builder),
      } as unknown as Db,
      likePattern,
    );
    await service.countDeathsCausedByPlayer({ eraId: 20 }, 21);
    expect(builder.where).toHaveBeenCalledTimes(1);
    expect(builder.limit).toHaveBeenCalledWith(21);
    expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
      'death',
      20,
    ]);
  });

  it('countDeathsCausedByPlayer joins matches and filters by competition when a competitionId is given', async () => {
    const builder = makeQueryBuilder([]);
    const service = new PlayersService(
      {
        select: vi.fn(() => builder),
      } as unknown as Db,
      likePattern,
    );
    await service.countDeathsCausedByPlayer({ competitionId: 30 }, 21);
    expect(builder.innerJoin).toHaveBeenCalledTimes(5);
    expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual([
      'players.id',
      'match_events.acting_player_id',
    ]);
    expect(builder.where).toHaveBeenCalledTimes(1);
    expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
      'death',
      30,
    ]);
  });

  it('countFoulsCommittedByPlayer returns the rows the query resolves to', async () => {
    const rows = [{ playerId: 1, name: 'Morg n Thorg', count: 6 }];
    const select = vi.fn(() => makeQueryBuilder(rows));
    const service = new PlayersService(
      { select } as unknown as Db,
      likePattern,
    );
    await expect(
      service.countFoulsCommittedByPlayer(FACT_SCOPE_ALL_TIME, 21),
    ).resolves.toEqual(rows);
  });

  it('countFoulsCommittedByPlayer adds an era filter when an eraId is given', async () => {
    const builder = makeQueryBuilder([]);
    const service = new PlayersService(
      {
        select: vi.fn(() => builder),
      } as unknown as Db,
      likePattern,
    );
    await service.countFoulsCommittedByPlayer({ eraId: 20 }, 21);
    expect(builder.where).toHaveBeenCalledTimes(1);
    expect(builder.limit).toHaveBeenCalledWith(21);
    expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
      'foul',
      20,
    ]);
  });

  it('countFoulsCommittedByPlayer joins matches and filters by competition when a competitionId is given', async () => {
    const builder = makeQueryBuilder([]);
    const service = new PlayersService(
      {
        select: vi.fn(() => builder),
      } as unknown as Db,
      likePattern,
    );
    await service.countFoulsCommittedByPlayer({ competitionId: 30 }, 21);
    expect(builder.innerJoin).toHaveBeenCalledTimes(5);
    expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual([
      'players.id',
      'match_events.acting_player_id',
    ]);
    expect(builder.where).toHaveBeenCalledTimes(1);
    expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
      'foul',
      30,
    ]);
  });

  it('countTimesSentOffByPlayer returns the rows the query resolves to', async () => {
    const rows = [{ playerId: 1, name: 'Morg n Thorg', count: 5 }];
    const select = vi.fn(() => makeQueryBuilder(rows));
    const service = new PlayersService(
      { select } as unknown as Db,
      likePattern,
    );
    await expect(
      service.countTimesSentOffByPlayer(FACT_SCOPE_ALL_TIME, 21),
    ).resolves.toEqual(rows);
  });

  it('countTimesSentOffByPlayer adds an era filter when an eraId is given', async () => {
    const builder = makeQueryBuilder([]);
    const service = new PlayersService(
      {
        select: vi.fn(() => builder),
      } as unknown as Db,
      likePattern,
    );
    await service.countTimesSentOffByPlayer({ eraId: 20 }, 21);
    expect(builder.where).toHaveBeenCalledTimes(1);
    expect(builder.limit).toHaveBeenCalledWith(21);
    expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
      'sent_off',
      20,
    ]);
  });

  it('countTimesSentOffByPlayer joins matches and filters by competition when a competitionId is given', async () => {
    const builder = makeQueryBuilder([]);
    const service = new PlayersService(
      {
        select: vi.fn(() => builder),
      } as unknown as Db,
      likePattern,
    );
    await service.countTimesSentOffByPlayer({ competitionId: 30 }, 21);
    expect(builder.innerJoin).toHaveBeenCalledTimes(5);
    expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual([
      'players.id',
      'match_events.consequence_player_id',
    ]);
    expect(builder.where).toHaveBeenCalledTimes(1);
    expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
      'sent_off',
      30,
    ]);
  });

  it('countCasualtiesSufferedByPlayer returns the rows the query resolves to', async () => {
    const rows = [
      { playerId: 1, name: 'Griff Oberwald', count: 9 },
      { playerId: 2, name: 'Zug', count: 4 },
    ];
    const select = vi.fn(() => makeQueryBuilder(rows));
    const service = new PlayersService(
      { select } as unknown as Db,
      likePattern,
    );
    await expect(
      service.countCasualtiesSufferedByPlayer(FACT_SCOPE_ALL_TIME, 21),
    ).resolves.toEqual(rows);
    expect(select).toHaveBeenCalledTimes(1);
  });

  it('countCasualtiesSufferedByPlayer adds an era filter when an eraId is given', async () => {
    const builder = makeQueryBuilder([]);
    const service = new PlayersService(
      {
        select: vi.fn(() => builder),
      } as unknown as Db,
      likePattern,
    );
    await service.countCasualtiesSufferedByPlayer({ eraId: 20 }, 21);
    expect(builder.where).toHaveBeenCalledTimes(1);
    expect(builder.limit).toHaveBeenCalledWith(21);
    expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
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
    ]);
  });

  it('countCasualtiesSufferedByPlayer filters on the full casualty-suffered consequence type list', async () => {
    const builder = makeQueryBuilder([]);
    const service = new PlayersService(
      {
        select: vi.fn(() => builder),
      } as unknown as Db,
      likePattern,
    );
    await service.countCasualtiesSufferedByPlayer(FACT_SCOPE_ALL_TIME, 21);
    const condition = firstCallArg(builder.where);
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
    const builder = makeQueryBuilder([]);
    const service = new PlayersService(
      {
        select: vi.fn(() => builder),
      } as unknown as Db,
      likePattern,
    );
    await service.countCasualtiesSufferedByPlayer({ competitionId: 30 }, 21);
    expect(builder.innerJoin).toHaveBeenCalledTimes(5);
    expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual([
      'players.id',
      'match_events.consequence_player_id',
    ]);
    expect(builder.where).toHaveBeenCalledTimes(1);
    expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
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
    ]);
  });

  it('countSeriousInjuriesSufferedByPlayer returns the rows the query resolves to', async () => {
    const rows = [{ playerId: 1, name: 'Griff Oberwald', count: 5 }];
    const select = vi.fn(() => makeQueryBuilder(rows));
    const service = new PlayersService(
      { select } as unknown as Db,
      likePattern,
    );
    await expect(
      service.countSeriousInjuriesSufferedByPlayer(FACT_SCOPE_ALL_TIME, 21),
    ).resolves.toEqual(rows);
  });

  it('countSeriousInjuriesSufferedByPlayer adds an era filter when an eraId is given', async () => {
    const builder = makeQueryBuilder([]);
    const service = new PlayersService(
      {
        select: vi.fn(() => builder),
      } as unknown as Db,
      likePattern,
    );
    await service.countSeriousInjuriesSufferedByPlayer({ eraId: 20 }, 21);
    expect(builder.where).toHaveBeenCalledTimes(1);
    expect(builder.limit).toHaveBeenCalledWith(21);
    expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
      'serious_injury',
      'niggling_injury',
      'miss_next_game',
      'stat_reduction_ma',
      'stat_reduction_st',
      'stat_reduction_ag',
      'stat_reduction_av',
      'stat_reduction_pa',
      20,
    ]);
  });

  it('countSeriousInjuriesSufferedByPlayer filters on the serious-injury-suffered consequence type list', async () => {
    const builder = makeQueryBuilder([]);
    const service = new PlayersService(
      {
        select: vi.fn(() => builder),
      } as unknown as Db,
      likePattern,
    );
    await service.countSeriousInjuriesSufferedByPlayer(FACT_SCOPE_ALL_TIME, 21);
    const condition = firstCallArg(builder.where);
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
    const builder = makeQueryBuilder([]);
    const service = new PlayersService(
      {
        select: vi.fn(() => builder),
      } as unknown as Db,
      likePattern,
    );
    await service.countSeriousInjuriesSufferedByPlayer(
      { competitionId: 30 },
      21,
    );
    expect(builder.innerJoin).toHaveBeenCalledTimes(5);
    expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual([
      'players.id',
      'match_events.consequence_player_id',
    ]);
    expect(builder.where).toHaveBeenCalledTimes(1);
    expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
      'serious_injury',
      'niggling_injury',
      'miss_next_game',
      'stat_reduction_ma',
      'stat_reduction_st',
      'stat_reduction_ag',
      'stat_reduction_av',
      'stat_reduction_pa',
      30,
    ]);
  });

  it('countLastingInjuriesSufferedByPlayer returns the rows the query resolves to', async () => {
    const rows = [{ playerId: 1, name: 'Griff Oberwald', count: 3 }];
    const select = vi.fn(() => makeQueryBuilder(rows));
    const service = new PlayersService(
      { select } as unknown as Db,
      likePattern,
    );
    await expect(
      service.countLastingInjuriesSufferedByPlayer(FACT_SCOPE_ALL_TIME, 21),
    ).resolves.toEqual(rows);
  });

  it('countLastingInjuriesSufferedByPlayer adds an era filter when an eraId is given', async () => {
    const builder = makeQueryBuilder([]);
    const service = new PlayersService(
      {
        select: vi.fn(() => builder),
      } as unknown as Db,
      likePattern,
    );
    await service.countLastingInjuriesSufferedByPlayer({ eraId: 20 }, 21);
    expect(builder.where).toHaveBeenCalledTimes(1);
    expect(builder.limit).toHaveBeenCalledWith(21);
    expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
      'niggling_injury',
      'stat_reduction_ma',
      'stat_reduction_st',
      'stat_reduction_ag',
      'stat_reduction_av',
      'stat_reduction_pa',
      20,
    ]);
  });

  it('countLastingInjuriesSufferedByPlayer filters on the lasting-injury-suffered consequence type list', async () => {
    const builder = makeQueryBuilder([]);
    const service = new PlayersService(
      {
        select: vi.fn(() => builder),
      } as unknown as Db,
      likePattern,
    );
    await service.countLastingInjuriesSufferedByPlayer(FACT_SCOPE_ALL_TIME, 21);
    const condition = firstCallArg(builder.where);
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
    const builder = makeQueryBuilder([]);
    const service = new PlayersService(
      {
        select: vi.fn(() => builder),
      } as unknown as Db,
      likePattern,
    );
    await service.countLastingInjuriesSufferedByPlayer(
      { competitionId: 30 },
      21,
    );
    expect(builder.innerJoin).toHaveBeenCalledTimes(5);
    expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual([
      'players.id',
      'match_events.consequence_player_id',
    ]);
    expect(builder.where).toHaveBeenCalledTimes(1);
    expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
      'niggling_injury',
      'stat_reduction_ma',
      'stat_reduction_st',
      'stat_reduction_ag',
      'stat_reduction_av',
      'stat_reduction_pa',
      30,
    ]);
  });

  it('countTouchdownsScoredByPlayer filters by league', async () => {
    const builder = makeQueryBuilder([]);
    const service = new PlayersService(
      {
        select: vi.fn(() => builder),
      } as unknown as Db,
      likePattern,
    );
    await service.countTouchdownsScoredByPlayer({ leagueId: 9 }, 21);
    expect(builder.where).toHaveBeenCalledTimes(1);
    expect(builder.innerJoin).toHaveBeenCalledTimes(5);
    expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
      'touchdown',
      9,
    ]);
  });
});
