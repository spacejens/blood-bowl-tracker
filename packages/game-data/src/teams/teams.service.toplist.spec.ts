import type { Db } from '@blood-bowl-tracker/db';
import { describe, expect, it, vi } from 'vitest';

import {
  extractAllFilterValues,
  extractFilterValues,
  extractJoinColumns,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { TeamsService } from './teams.service';
import { makeQueryBuilder } from './teams.service.test-helpers';

describe('TeamsService', () => {
  describe('toplist queries', () => {
    it('countMatchesPlayedByTeam returns the rows the query resolves to', async () => {
      const rows = [
        { teamId: 1, name: '40 grinders', count: 12 },
        { teamId: 2, name: 'Reikland Reavers', count: 7 },
      ];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new TeamsService({ select } as unknown as Db);
      await expect(service.countMatchesPlayedByTeam({}, 21)).resolves.toEqual(
        rows,
      );
      expect(select).toHaveBeenCalledTimes(1);
    });

    it('countMatchesPlayedByTeam applies the SQL limit and filters by era when an eraId is given', async () => {
      const rows = [{ teamId: 1, name: '40 grinders', count: 3 }];
      const builder = makeQueryBuilder(rows);
      const select = vi.fn(() => builder);
      const service = new TeamsService({ select } as unknown as Db);
      await expect(
        service.countMatchesPlayedByTeam({ eraId: 20 }, 21),
      ).resolves.toEqual(rows);
      // The era-filtered path must add a WHERE clause.
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['match_teams.match_id', 'matches.id'],
      );
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(20);
      expect(builder.limit).toHaveBeenCalledWith(21);
    });

    it('countCompetitionsByTeam returns the rows the query resolves to', async () => {
      const rows = [
        { teamId: 1, name: '40 grinders', count: 4 },
        { teamId: 2, name: 'Reikland Reavers', count: 4 },
      ];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new TeamsService({ select } as unknown as Db);
      await expect(service.countCompetitionsByTeam({}, 21)).resolves.toEqual(
        rows,
      );
      expect(select).toHaveBeenCalledTimes(1);
    });

    it('countCompetitionsByTeam applies the SQL limit and filters by era when an eraId is given', async () => {
      const rows = [{ teamId: 1, name: '40 grinders', count: 2 }];
      const builder = makeQueryBuilder(rows);
      const select = vi.fn(() => builder);
      const service = new TeamsService({ select } as unknown as Db);
      await expect(
        service.countCompetitionsByTeam({ eraId: 20 }, 21),
      ).resolves.toEqual(rows);
      // The era-filtered path must add a WHERE clause.
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['competition_teams.competition_id', 'competitions.id'],
      );
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(20);
      expect(builder.limit).toHaveBeenCalledWith(21);
    });

    it('countCompetitionsByTeam still calls where (with undefined) when no era is given', async () => {
      const rows: unknown[] = [];
      const builder = makeQueryBuilder(rows);
      const select = vi.fn(() => builder);
      const service = new TeamsService({ select } as unknown as Db);
      await expect(service.countCompetitionsByTeam({}, 21)).resolves.toEqual(
        rows,
      );
      expect(builder.where).toHaveBeenCalledTimes(1);
    });

    it('countErasByTeam returns the rows the query resolves to', async () => {
      const rows = [
        { teamId: 1, name: '40 grinders', count: 3 },
        { teamId: 2, name: 'Reikland Reavers', count: 3 },
      ];
      const builder = makeQueryBuilder(rows);
      const select = vi.fn(() => builder);
      const service = new TeamsService({ select } as unknown as Db);
      await expect(service.countErasByTeam(21)).resolves.toEqual(rows);
      expect(select).toHaveBeenCalledTimes(1);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['teams.id', 'team_eras.team_id'],
      );
      expect(builder.limit).toHaveBeenCalledWith(21);
    });

    it('countErasByTeam takes no era filter and issues no where clause', async () => {
      const rows = [{ teamId: 1, name: '40 grinders', count: 5 }];
      const builder = makeQueryBuilder(rows);
      const select = vi.fn(() => builder);
      const service = new TeamsService({ select } as unknown as Db);
      await expect(service.countErasByTeam(21)).resolves.toEqual(rows);
      expect(builder.where).not.toHaveBeenCalled();
    });

    it('countTouchdownsScoredByTeam returns the rows the query resolves to', async () => {
      const rows = [{ teamId: 1, name: '40 grinders', count: 15 }];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new TeamsService({ select } as unknown as Db);
      await expect(
        service.countTouchdownsScoredByTeam({}, 21),
      ).resolves.toEqual(rows);
      expect(select).toHaveBeenCalledTimes(1);
    });

    it('countTouchdownsScoredByTeam adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countTouchdownsScoredByTeam({ eraId: 20 }, 21);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(builder.limit).toHaveBeenCalledWith(21);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'touchdown',
        20,
      ]);
    });

    it('countTouchdownsScoredByTeam joins matches and filters by competition when a competitionId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countTouchdownsScoredByTeam({ competitionId: 30 }, 21);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(builder.innerJoin).toHaveBeenCalledTimes(5);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['match_teams.id', 'match_events.acting_match_team_id'],
      );
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'touchdown',
        30,
      ]);
    });

    it('countCompletionsByTeam returns the rows the query resolves to', async () => {
      const rows = [{ teamId: 1, name: '40 grinders', count: 8 }];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new TeamsService({ select } as unknown as Db);
      await expect(service.countCompletionsByTeam({}, 21)).resolves.toEqual(
        rows,
      );
    });

    it('countCompletionsByTeam adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countCompletionsByTeam({ eraId: 20 }, 21);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(builder.limit).toHaveBeenCalledWith(21);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'completion',
        20,
      ]);
    });

    it('countCompletionsByTeam joins matches and filters by competition when a competitionId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countCompletionsByTeam({ competitionId: 30 }, 21);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(builder.innerJoin).toHaveBeenCalledTimes(5);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['match_teams.id', 'match_events.acting_match_team_id'],
      );
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'completion',
        30,
      ]);
    });

    it('countInterceptionsByTeam returns the rows the query resolves to', async () => {
      const rows = [{ teamId: 1, name: '40 grinders', count: 5 }];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new TeamsService({ select } as unknown as Db);
      await expect(service.countInterceptionsByTeam({}, 21)).resolves.toEqual(
        rows,
      );
    });

    it('countInterceptionsByTeam adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countInterceptionsByTeam({ eraId: 20 }, 21);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(builder.limit).toHaveBeenCalledWith(21);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'interception',
        20,
      ]);
    });

    it('countInterceptionsByTeam joins matches and filters by competition when a competitionId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countInterceptionsByTeam({ competitionId: 30 }, 21);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(builder.innerJoin).toHaveBeenCalledTimes(5);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['match_teams.id', 'match_events.acting_match_team_id'],
      );
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'interception',
        30,
      ]);
    });

    it('countDeflectionsByTeam returns the rows the query resolves to', async () => {
      const rows = [{ teamId: 1, name: '40 grinders', count: 4 }];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new TeamsService({ select } as unknown as Db);
      await expect(service.countDeflectionsByTeam({}, 21)).resolves.toEqual(
        rows,
      );
    });

    it('countDeflectionsByTeam adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countDeflectionsByTeam({ eraId: 20 }, 21);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(builder.limit).toHaveBeenCalledWith(21);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'deflection',
        20,
      ]);
    });

    it('countDeflectionsByTeam joins matches and filters by competition when a competitionId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countDeflectionsByTeam({ competitionId: 30 }, 21);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(builder.innerJoin).toHaveBeenCalledTimes(5);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['match_teams.id', 'match_events.acting_match_team_id'],
      );
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'deflection',
        30,
      ]);
    });

    it('countCasualtiesCausedByTeam returns the rows the query resolves to', async () => {
      const rows = [
        { teamId: 1, name: '40 grinders', count: 22 },
        { teamId: 2, name: 'Gouged Eye', count: 9 },
      ];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new TeamsService({ select } as unknown as Db);
      await expect(
        service.countCasualtiesCausedByTeam({}, 21),
      ).resolves.toEqual(rows);
      expect(select).toHaveBeenCalledTimes(1);
    });

    it('countCasualtiesCausedByTeam adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countCasualtiesCausedByTeam({ eraId: 20 }, 21);
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

    it('countCasualtiesCausedByTeam joins matches and filters by competition when a competitionId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countCasualtiesCausedByTeam({ competitionId: 30 }, 21);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(builder.innerJoin).toHaveBeenCalledTimes(5);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['match_teams.id', 'match_events.acting_match_team_id'],
      );
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'casualty',
        'badly_hurt',
        'serious_injury',
        'death',
        30,
      ]);
    });

    it('countSeriousInjuriesCausedByTeam returns the rows the query resolves to', async () => {
      const rows = [{ teamId: 1, name: '40 grinders', count: 7 }];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new TeamsService({ select } as unknown as Db);
      await expect(
        service.countSeriousInjuriesCausedByTeam({}, 21),
      ).resolves.toEqual(rows);
    });

    it('countSeriousInjuriesCausedByTeam adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countSeriousInjuriesCausedByTeam({ eraId: 20 }, 21);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(builder.limit).toHaveBeenCalledWith(21);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'serious_injury',
        20,
      ]);
    });

    it('countSeriousInjuriesCausedByTeam joins matches and filters by competition when a competitionId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countSeriousInjuriesCausedByTeam({ competitionId: 30 }, 21);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(builder.innerJoin).toHaveBeenCalledTimes(5);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['match_teams.id', 'match_events.acting_match_team_id'],
      );
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'serious_injury',
        30,
      ]);
    });

    it('countDeathsCausedByTeam returns the rows the query resolves to', async () => {
      const rows = [{ teamId: 1, name: '40 grinders', count: 4 }];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new TeamsService({ select } as unknown as Db);
      await expect(service.countDeathsCausedByTeam({}, 21)).resolves.toEqual(
        rows,
      );
    });

    it('countDeathsCausedByTeam adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countDeathsCausedByTeam({ eraId: 20 }, 21);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(builder.limit).toHaveBeenCalledWith(21);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'death',
        20,
      ]);
    });

    it('countDeathsCausedByTeam joins matches and filters by competition when a competitionId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countDeathsCausedByTeam({ competitionId: 30 }, 21);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(builder.innerJoin).toHaveBeenCalledTimes(5);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['match_teams.id', 'match_events.acting_match_team_id'],
      );
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'death',
        30,
      ]);
    });

    it('countFoulsCommittedByTeam returns the rows the query resolves to', async () => {
      const rows = [{ teamId: 1, name: '40 grinders', count: 13 }];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new TeamsService({ select } as unknown as Db);
      await expect(service.countFoulsCommittedByTeam({}, 21)).resolves.toEqual(
        rows,
      );
    });

    it('countFoulsCommittedByTeam adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countFoulsCommittedByTeam({ eraId: 20 }, 21);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(builder.limit).toHaveBeenCalledWith(21);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'foul',
        20,
      ]);
    });

    it('countFoulsCommittedByTeam joins matches and filters by competition when a competitionId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countFoulsCommittedByTeam({ competitionId: 30 }, 21);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(builder.innerJoin).toHaveBeenCalledTimes(5);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['match_teams.id', 'match_events.acting_match_team_id'],
      );
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'foul',
        30,
      ]);
    });

    it('countTimesSentOffByTeam returns the rows the query resolves to', async () => {
      const rows = [{ teamId: 1, name: '40 grinders', count: 8 }];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new TeamsService({ select } as unknown as Db);
      await expect(service.countTimesSentOffByTeam({}, 21)).resolves.toEqual(
        rows,
      );
    });

    it('countTimesSentOffByTeam adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countTimesSentOffByTeam({ eraId: 20 }, 21);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(builder.limit).toHaveBeenCalledWith(21);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'sent_off',
        20,
      ]);
    });

    it('countTimesSentOffByTeam joins matches and filters by competition when a competitionId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countTimesSentOffByTeam({ competitionId: 30 }, 21);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(builder.innerJoin).toHaveBeenCalledTimes(5);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['match_teams.id', 'match_events.consequence_match_team_id'],
      );
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'sent_off',
        30,
      ]);
    });

    it('countCasualtiesSufferedByTeam returns the rows the query resolves to', async () => {
      const rows = [
        { teamId: 1, name: '40 grinders', count: 18 },
        { teamId: 2, name: 'Gouged Eye', count: 7 },
      ];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new TeamsService({ select } as unknown as Db);
      await expect(
        service.countCasualtiesSufferedByTeam({}, 21),
      ).resolves.toEqual(rows);
      expect(select).toHaveBeenCalledTimes(1);
    });

    it('countCasualtiesSufferedByTeam adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countCasualtiesSufferedByTeam({ eraId: 20 }, 21);
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

    it('countCasualtiesSufferedByTeam filters on the full casualty-suffered consequence type list', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countCasualtiesSufferedByTeam({}, 21);
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

    it('countCasualtiesSufferedByTeam joins matches and filters by competition when a competitionId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countCasualtiesSufferedByTeam({ competitionId: 30 }, 21);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(builder.innerJoin).toHaveBeenCalledTimes(5);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['match_teams.id', 'match_events.consequence_match_team_id'],
      );
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

    it('countSeriousInjuriesSufferedByTeam returns the rows the query resolves to', async () => {
      const rows = [{ teamId: 1, name: '40 grinders', count: 6 }];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new TeamsService({ select } as unknown as Db);
      await expect(
        service.countSeriousInjuriesSufferedByTeam({}, 21),
      ).resolves.toEqual(rows);
    });

    it('countSeriousInjuriesSufferedByTeam adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countSeriousInjuriesSufferedByTeam({ eraId: 20 }, 21);
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

    it('countSeriousInjuriesSufferedByTeam filters on the serious-injury-suffered consequence type list', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countSeriousInjuriesSufferedByTeam({}, 21);
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

    it('countSeriousInjuriesSufferedByTeam joins matches and filters by competition when a competitionId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countSeriousInjuriesSufferedByTeam(
        { competitionId: 30 },
        21,
      );
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(builder.innerJoin).toHaveBeenCalledTimes(5);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['match_teams.id', 'match_events.consequence_match_team_id'],
      );
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

    it('countLastingInjuriesSufferedByTeam returns the rows the query resolves to', async () => {
      const rows = [{ teamId: 1, name: '40 grinders', count: 4 }];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new TeamsService({ select } as unknown as Db);
      await expect(
        service.countLastingInjuriesSufferedByTeam({}, 21),
      ).resolves.toEqual(rows);
    });

    it('countLastingInjuriesSufferedByTeam adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countLastingInjuriesSufferedByTeam({ eraId: 20 }, 21);
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

    it('countLastingInjuriesSufferedByTeam filters on the lasting-injury-suffered consequence type list', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countLastingInjuriesSufferedByTeam({}, 21);
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

    it('countLastingInjuriesSufferedByTeam joins matches and filters by competition when a competitionId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countLastingInjuriesSufferedByTeam(
        { competitionId: 30 },
        21,
      );
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(builder.innerJoin).toHaveBeenCalledTimes(5);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['match_teams.id', 'match_events.consequence_match_team_id'],
      );
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

    it('countDeathsSufferedByTeam returns the rows the query resolves to', async () => {
      const rows = [{ teamId: 1, name: '40 grinders', count: 2 }];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new TeamsService({ select } as unknown as Db);
      await expect(service.countDeathsSufferedByTeam({}, 21)).resolves.toEqual(
        rows,
      );
    });

    it('countDeathsSufferedByTeam adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countDeathsSufferedByTeam({ eraId: 20 }, 21);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(builder.limit).toHaveBeenCalledWith(21);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'death',
        20,
      ]);
    });

    it('countDeathsSufferedByTeam filters on the single death consequence type', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countDeathsSufferedByTeam({}, 21);
      const condition = firstCallArg(builder.where);
      expect(extractFilterValues(condition)).toEqual(['death']);
    });

    it('countDeathsSufferedByTeam joins matches and filters by competition when a competitionId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countDeathsSufferedByTeam({ competitionId: 30 }, 21);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(builder.innerJoin).toHaveBeenCalledTimes(5);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['match_teams.id', 'match_events.consequence_match_team_id'],
      );
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'death',
        30,
      ]);
    });

    it('sumExpensiveMistakesByTeam returns the rows the query resolves to', async () => {
      const rows = [
        { teamId: 1, name: '40 grinders', count: 150000 },
        { teamId: 2, name: 'Reikland Reavers', count: 40000 },
      ];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new TeamsService({ select } as unknown as Db);
      await expect(service.sumExpensiveMistakesByTeam({}, 21)).resolves.toEqual(
        rows,
      );
      expect(select).toHaveBeenCalledTimes(1);
    });

    it('sumExpensiveMistakesByTeam applies the SQL limit to the query', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.sumExpensiveMistakesByTeam({}, 21);
      expect(builder.limit).toHaveBeenCalledWith(21);
    });

    it('sumExpensiveMistakesByTeam filters on the expensive_mistake consequence and era', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.sumExpensiveMistakesByTeam({ eraId: 20 }, 21);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'expensive_mistake',
        20,
      ]);
    });

    it('sumExpensiveMistakesByTeam joins the consequence side and filters by competition', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.sumExpensiveMistakesByTeam({ competitionId: 30 }, 21);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(builder.innerJoin).toHaveBeenCalledTimes(5);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['match_teams.id', 'match_events.consequence_match_team_id'],
      );
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'expensive_mistake',
        30,
      ]);
    });

    it('sumExpensiveMistakesByTeam groups by team', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.sumExpensiveMistakesByTeam({}, 21);
      expect(builder.groupBy).toHaveBeenCalledTimes(1);
    });

    it('listBiggestExpensiveMistakes returns the rows the query resolves to', async () => {
      const rows = [
        { teamId: 1, name: '40 grinders', count: 90000, date: '2026-03-04' },
        { teamId: 2, name: 'Gouged Eye', count: 60000, date: '2026-02-01' },
      ];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new TeamsService({ select } as unknown as Db);
      await expect(
        service.listBiggestExpensiveMistakes({}, 21),
      ).resolves.toEqual(rows);
      expect(select).toHaveBeenCalledTimes(1);
    });

    it('listBiggestExpensiveMistakes applies the SQL limit to the query', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.listBiggestExpensiveMistakes({}, 21);
      expect(builder.limit).toHaveBeenCalledWith(21);
    });

    it('listBiggestExpensiveMistakes filters on the expensive_mistake consequence and era', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.listBiggestExpensiveMistakes({ eraId: 20 }, 21);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'expensive_mistake',
        20,
      ]);
    });

    it('listBiggestExpensiveMistakes excludes rows with a null expensive-mistake amount', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.listBiggestExpensiveMistakes({}, 21);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(
        extractJoinColumns(firstCallArg(builder.where)).filter(
          (column) => column === 'match_events.expensive_mistake',
        ),
      ).toHaveLength(1);
    });

    it('listBiggestExpensiveMistakes joins the consequence side and filters by competition', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.listBiggestExpensiveMistakes({ competitionId: 30 }, 21);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(builder.innerJoin).toHaveBeenCalledTimes(5);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['match_teams.id', 'match_events.consequence_match_team_id'],
      );
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'expensive_mistake',
        30,
      ]);
    });

    it('listBiggestExpensiveMistakes does not group (one row per event)', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.listBiggestExpensiveMistakes({}, 21);
      expect(builder.groupBy).not.toHaveBeenCalled();
    });
  });

  describe('league scoping', () => {
    it('countMatchesPlayedByTeam filters by league via the eras join', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countMatchesPlayedByTeam({ leagueId: 9 }, 21);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 2, 1))).toEqual(
        ['eras.id', 'team_eras.era_id'],
      );
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(9);
    });

    it('countCompetitionsByTeam filters by league via the eras join', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countCompetitionsByTeam({ leagueId: 9 }, 21);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 2, 1))).toEqual(
        ['eras.id', 'team_eras.era_id'],
      );
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(9);
    });

    it('countTouchdownsScoredByTeam filters by league', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countTouchdownsScoredByTeam({ leagueId: 9 }, 21);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(builder.innerJoin).toHaveBeenCalledTimes(5);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'touchdown',
        9,
      ]);
    });

    it('sumExpensiveMistakesByTeam filters by league', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.sumExpensiveMistakesByTeam({ leagueId: 9 }, 21);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'expensive_mistake',
        9,
      ]);
    });

    it('listBiggestExpensiveMistakes filters by league', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.listBiggestExpensiveMistakes({ leagueId: 9 }, 21);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'expensive_mistake',
        9,
      ]);
    });
  });
});
