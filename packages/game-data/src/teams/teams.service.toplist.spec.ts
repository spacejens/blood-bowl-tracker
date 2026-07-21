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
      await expect(service.countMatchesPlayedByTeam()).resolves.toEqual(rows);
      expect(select).toHaveBeenCalledTimes(1);
    });

    it('countMatchesPlayedByTeam filters by era when an eraId is given', async () => {
      const rows = [{ teamId: 1, name: '40 grinders', count: 3 }];
      const builder = makeQueryBuilder(rows);
      const select = vi.fn(() => builder);
      const service = new TeamsService({ select } as unknown as Db);
      await expect(service.countMatchesPlayedByTeam(20)).resolves.toEqual(rows);
      // The era-filtered path must add a WHERE clause.
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['match_teams.match_id', 'matches.id'],
      );
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(20);
    });

    it('countCompetitionsByTeam returns the rows the query resolves to', async () => {
      const rows = [
        { teamId: 1, name: '40 grinders', count: 4 },
        { teamId: 2, name: 'Reikland Reavers', count: 4 },
      ];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new TeamsService({ select } as unknown as Db);
      await expect(service.countCompetitionsByTeam()).resolves.toEqual(rows);
      expect(select).toHaveBeenCalledTimes(1);
    });

    it('countCompetitionsByTeam filters by era when an eraId is given', async () => {
      const rows = [{ teamId: 1, name: '40 grinders', count: 2 }];
      const builder = makeQueryBuilder(rows);
      const select = vi.fn(() => builder);
      const service = new TeamsService({ select } as unknown as Db);
      await expect(service.countCompetitionsByTeam(20)).resolves.toEqual(rows);
      // The era-filtered path must add a WHERE clause.
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['competition_teams.competition_id', 'competitions.id'],
      );
      expect(extractFilterValues(firstCallArg(builder.where))).toBe(20);
    });

    it('countCompetitionsByTeam still calls where (with undefined) when no era is given', async () => {
      const rows: unknown[] = [];
      const builder = makeQueryBuilder(rows);
      const select = vi.fn(() => builder);
      const service = new TeamsService({ select } as unknown as Db);
      await expect(service.countCompetitionsByTeam()).resolves.toEqual(rows);
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
      await expect(service.countErasByTeam()).resolves.toEqual(rows);
      expect(select).toHaveBeenCalledTimes(1);
      expect(extractJoinColumns(firstCallArg(builder.innerJoin, 0, 1))).toEqual(
        ['teams.id', 'team_eras.team_id'],
      );
    });

    it('countErasByTeam takes no era filter and issues no where clause', async () => {
      const rows = [{ teamId: 1, name: '40 grinders', count: 5 }];
      const builder = makeQueryBuilder(rows);
      const select = vi.fn(() => builder);
      const service = new TeamsService({ select } as unknown as Db);
      await expect(service.countErasByTeam()).resolves.toEqual(rows);
      expect(builder.where).not.toHaveBeenCalled();
    });

    it('countTouchdownsScoredByTeam returns the rows the query resolves to', async () => {
      const rows = [{ teamId: 1, name: '40 grinders', count: 15 }];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new TeamsService({ select } as unknown as Db);
      await expect(service.countTouchdownsScoredByTeam()).resolves.toEqual(
        rows,
      );
      expect(select).toHaveBeenCalledTimes(1);
    });

    it('countTouchdownsScoredByTeam adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countTouchdownsScoredByTeam(20);
      expect(builder.where).toHaveBeenCalledTimes(1);
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
      await service.countTouchdownsScoredByTeam(undefined, 30);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(builder.innerJoin).toHaveBeenCalledTimes(4);
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
      await expect(service.countCompletionsByTeam()).resolves.toEqual(rows);
    });

    it('countCompletionsByTeam adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countCompletionsByTeam(20);
      expect(builder.where).toHaveBeenCalledTimes(1);
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
      await service.countCompletionsByTeam(undefined, 30);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(builder.innerJoin).toHaveBeenCalledTimes(4);
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
      await expect(service.countInterceptionsByTeam()).resolves.toEqual(rows);
    });

    it('countInterceptionsByTeam adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countInterceptionsByTeam(20);
      expect(builder.where).toHaveBeenCalledTimes(1);
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
      await service.countInterceptionsByTeam(undefined, 30);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(builder.innerJoin).toHaveBeenCalledTimes(4);
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
      await expect(service.countDeflectionsByTeam()).resolves.toEqual(rows);
    });

    it('countDeflectionsByTeam adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countDeflectionsByTeam(20);
      expect(builder.where).toHaveBeenCalledTimes(1);
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
      await service.countDeflectionsByTeam(undefined, 30);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(builder.innerJoin).toHaveBeenCalledTimes(4);
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
      await expect(service.countCasualtiesCausedByTeam()).resolves.toEqual(
        rows,
      );
      expect(select).toHaveBeenCalledTimes(1);
    });

    it('countCasualtiesCausedByTeam adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countCasualtiesCausedByTeam(20);
      expect(builder.where).toHaveBeenCalledTimes(1);
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
      await service.countCasualtiesCausedByTeam(undefined, 30);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(builder.innerJoin).toHaveBeenCalledTimes(4);
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
      await expect(service.countSeriousInjuriesCausedByTeam()).resolves.toEqual(
        rows,
      );
    });

    it('countSeriousInjuriesCausedByTeam adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countSeriousInjuriesCausedByTeam(20);
      expect(builder.where).toHaveBeenCalledTimes(1);
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
      await service.countSeriousInjuriesCausedByTeam(undefined, 30);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(builder.innerJoin).toHaveBeenCalledTimes(4);
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
      await expect(service.countDeathsCausedByTeam()).resolves.toEqual(rows);
    });

    it('countDeathsCausedByTeam adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countDeathsCausedByTeam(20);
      expect(builder.where).toHaveBeenCalledTimes(1);
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
      await service.countDeathsCausedByTeam(undefined, 30);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(builder.innerJoin).toHaveBeenCalledTimes(4);
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
      await expect(service.countFoulsCommittedByTeam()).resolves.toEqual(rows);
    });

    it('countFoulsCommittedByTeam adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countFoulsCommittedByTeam(20);
      expect(builder.where).toHaveBeenCalledTimes(1);
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
      await service.countFoulsCommittedByTeam(undefined, 30);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(builder.innerJoin).toHaveBeenCalledTimes(4);
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
      await expect(service.countTimesSentOffByTeam()).resolves.toEqual(rows);
    });

    it('countTimesSentOffByTeam adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countTimesSentOffByTeam(20);
      expect(builder.where).toHaveBeenCalledTimes(1);
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
      await service.countTimesSentOffByTeam(undefined, 30);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(builder.innerJoin).toHaveBeenCalledTimes(4);
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
      await expect(service.countCasualtiesSufferedByTeam()).resolves.toEqual(
        rows,
      );
      expect(select).toHaveBeenCalledTimes(1);
    });

    it('countCasualtiesSufferedByTeam adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countCasualtiesSufferedByTeam(20);
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
        20,
      ]);
    });

    it('countCasualtiesSufferedByTeam filters on the full casualty-suffered consequence type list', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countCasualtiesSufferedByTeam();
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
      await service.countCasualtiesSufferedByTeam(undefined, 30);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(builder.innerJoin).toHaveBeenCalledTimes(4);
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
        service.countSeriousInjuriesSufferedByTeam(),
      ).resolves.toEqual(rows);
    });

    it('countSeriousInjuriesSufferedByTeam adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countSeriousInjuriesSufferedByTeam(20);
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
        20,
      ]);
    });

    it('countSeriousInjuriesSufferedByTeam filters on the serious-injury-suffered consequence type list', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countSeriousInjuriesSufferedByTeam();
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
      await service.countSeriousInjuriesSufferedByTeam(undefined, 30);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(builder.innerJoin).toHaveBeenCalledTimes(4);
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
        service.countLastingInjuriesSufferedByTeam(),
      ).resolves.toEqual(rows);
    });

    it('countLastingInjuriesSufferedByTeam adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countLastingInjuriesSufferedByTeam(20);
      expect(builder.where).toHaveBeenCalledTimes(1);
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
      await service.countLastingInjuriesSufferedByTeam();
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
      await service.countLastingInjuriesSufferedByTeam(undefined, 30);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(builder.innerJoin).toHaveBeenCalledTimes(4);
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
      await expect(service.countDeathsSufferedByTeam()).resolves.toEqual(rows);
    });

    it('countDeathsSufferedByTeam adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countDeathsSufferedByTeam(20);
      expect(builder.where).toHaveBeenCalledTimes(1);
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
      await service.countDeathsSufferedByTeam();
      const condition = firstCallArg(builder.where);
      expect(extractFilterValues(condition)).toEqual(['death']);
    });

    it('countDeathsSufferedByTeam joins matches and filters by competition when a competitionId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.countDeathsSufferedByTeam(undefined, 30);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(builder.innerJoin).toHaveBeenCalledTimes(4);
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
      await expect(service.sumExpensiveMistakesByTeam()).resolves.toEqual(rows);
      expect(select).toHaveBeenCalledTimes(1);
    });

    it('sumExpensiveMistakesByTeam filters on the expensive_mistake consequence and era', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.sumExpensiveMistakesByTeam(20);
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
      await service.sumExpensiveMistakesByTeam(undefined, 30);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(builder.innerJoin).toHaveBeenCalledTimes(4);
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
      await service.sumExpensiveMistakesByTeam();
      expect(builder.groupBy).toHaveBeenCalledTimes(1);
    });

    it('listBiggestExpensiveMistakes returns the rows the query resolves to', async () => {
      const rows = [
        { teamId: 1, name: '40 grinders', count: 90000, date: '2026-03-04' },
        { teamId: 2, name: 'Gouged Eye', count: 60000, date: '2026-02-01' },
      ];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new TeamsService({ select } as unknown as Db);
      await expect(service.listBiggestExpensiveMistakes()).resolves.toEqual(
        rows,
      );
      expect(select).toHaveBeenCalledTimes(1);
    });

    it('listBiggestExpensiveMistakes filters on the expensive_mistake consequence and era', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.listBiggestExpensiveMistakes(20);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(extractAllFilterValues(firstCallArg(builder.where))).toEqual([
        'expensive_mistake',
        20,
      ]);
    });

    it('listBiggestExpensiveMistakes joins the consequence side and filters by competition', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService({
        select: vi.fn(() => builder),
      } as unknown as Db);
      await service.listBiggestExpensiveMistakes(undefined, 30);
      expect(builder.where).toHaveBeenCalledTimes(1);
      expect(builder.innerJoin).toHaveBeenCalledTimes(4);
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
      await service.listBiggestExpensiveMistakes();
      expect(builder.groupBy).not.toHaveBeenCalled();
    });
  });
});
