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
import { TeamsService } from './teams.service';
import { makeQueryBuilder } from './teams.service.test-helpers';

describe('TeamsService', () => {
  const likePattern = new LikePatternService();

  describe('toplist queries', () => {
    it('countMatchesPlayedByTeam returns the rows the query resolves to', async () => {
      const rows = [
        { teamId: 1, name: '40 grinders', count: 12 },
        { teamId: 2, name: 'Reikland Reavers', count: 7 },
      ];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new TeamsService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(
        service.countMatchesPlayedByTeam(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(rows);
      expect(select).toHaveBeenCalledTimes(1);
    });

    it('countMatchesPlayedByTeam applies the SQL limit and filters by era when an eraId is given', async () => {
      const rows = [{ teamId: 1, name: '40 grinders', count: 3 }];
      const builder = makeQueryBuilder(rows);
      const select = vi.fn(() => builder);
      const service = new TeamsService(
        { select } as unknown as Db,
        likePattern,
      );
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
      const service = new TeamsService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(
        service.countCompetitionsByTeam(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(rows);
      expect(select).toHaveBeenCalledTimes(1);
    });

    it('countCompetitionsByTeam applies the SQL limit and filters by era when an eraId is given', async () => {
      const rows = [{ teamId: 1, name: '40 grinders', count: 2 }];
      const builder = makeQueryBuilder(rows);
      const select = vi.fn(() => builder);
      const service = new TeamsService(
        { select } as unknown as Db,
        likePattern,
      );
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
      const service = new TeamsService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(
        service.countCompetitionsByTeam(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(rows);
      expect(builder.where).toHaveBeenCalledTimes(1);
    });

    it('countErasByTeam returns the rows the query resolves to', async () => {
      const rows = [
        { teamId: 1, name: '40 grinders', count: 3 },
        { teamId: 2, name: 'Reikland Reavers', count: 3 },
      ];
      const builder = makeQueryBuilder(rows);
      const select = vi.fn(() => builder);
      const service = new TeamsService(
        { select } as unknown as Db,
        likePattern,
      );
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
      const service = new TeamsService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(service.countErasByTeam(21)).resolves.toEqual(rows);
      expect(builder.where).not.toHaveBeenCalled();
    });

    it('countTouchdownsScoredByTeam returns the rows the query resolves to', async () => {
      const rows = [{ teamId: 1, name: '40 grinders', count: 15 }];
      const select = vi.fn(() => makeQueryBuilder(rows));
      const service = new TeamsService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(
        service.countTouchdownsScoredByTeam(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(rows);
      expect(select).toHaveBeenCalledTimes(1);
    });

    it('countTouchdownsScoredByTeam adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService(
        {
          select: vi.fn(() => builder),
        } as unknown as Db,
        likePattern,
      );
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
      const service = new TeamsService(
        {
          select: vi.fn(() => builder),
        } as unknown as Db,
        likePattern,
      );
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
      const service = new TeamsService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(
        service.countCompletionsByTeam(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(rows);
    });

    it('countCompletionsByTeam adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService(
        {
          select: vi.fn(() => builder),
        } as unknown as Db,
        likePattern,
      );
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
      const service = new TeamsService(
        {
          select: vi.fn(() => builder),
        } as unknown as Db,
        likePattern,
      );
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
      const service = new TeamsService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(
        service.countInterceptionsByTeam(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(rows);
    });

    it('countInterceptionsByTeam adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService(
        {
          select: vi.fn(() => builder),
        } as unknown as Db,
        likePattern,
      );
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
      const service = new TeamsService(
        {
          select: vi.fn(() => builder),
        } as unknown as Db,
        likePattern,
      );
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
      const service = new TeamsService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(
        service.countDeflectionsByTeam(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(rows);
    });

    it('countDeflectionsByTeam adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService(
        {
          select: vi.fn(() => builder),
        } as unknown as Db,
        likePattern,
      );
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
      const service = new TeamsService(
        {
          select: vi.fn(() => builder),
        } as unknown as Db,
        likePattern,
      );
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
      const service = new TeamsService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(
        service.countCasualtiesCausedByTeam(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(rows);
      expect(select).toHaveBeenCalledTimes(1);
    });

    it('countCasualtiesCausedByTeam adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService(
        {
          select: vi.fn(() => builder),
        } as unknown as Db,
        likePattern,
      );
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
      const service = new TeamsService(
        {
          select: vi.fn(() => builder),
        } as unknown as Db,
        likePattern,
      );
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
      const service = new TeamsService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(
        service.countSeriousInjuriesCausedByTeam(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(rows);
    });

    it('countSeriousInjuriesCausedByTeam adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService(
        {
          select: vi.fn(() => builder),
        } as unknown as Db,
        likePattern,
      );
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
      const service = new TeamsService(
        {
          select: vi.fn(() => builder),
        } as unknown as Db,
        likePattern,
      );
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
      const service = new TeamsService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(
        service.countDeathsCausedByTeam(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(rows);
    });

    it('countDeathsCausedByTeam adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService(
        {
          select: vi.fn(() => builder),
        } as unknown as Db,
        likePattern,
      );
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
      const service = new TeamsService(
        {
          select: vi.fn(() => builder),
        } as unknown as Db,
        likePattern,
      );
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
      const service = new TeamsService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(
        service.countFoulsCommittedByTeam(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(rows);
    });

    it('countFoulsCommittedByTeam adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService(
        {
          select: vi.fn(() => builder),
        } as unknown as Db,
        likePattern,
      );
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
      const service = new TeamsService(
        {
          select: vi.fn(() => builder),
        } as unknown as Db,
        likePattern,
      );
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
      const service = new TeamsService(
        { select } as unknown as Db,
        likePattern,
      );
      await expect(
        service.countTimesSentOffByTeam(FACT_SCOPE_ALL_TIME, 21),
      ).resolves.toEqual(rows);
    });

    it('countTimesSentOffByTeam adds an era filter when an eraId is given', async () => {
      const builder = makeQueryBuilder([]);
      const service = new TeamsService(
        {
          select: vi.fn(() => builder),
        } as unknown as Db,
        likePattern,
      );
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
      const service = new TeamsService(
        {
          select: vi.fn(() => builder),
        } as unknown as Db,
        likePattern,
      );
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
  });
});
