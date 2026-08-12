import {
  CoachesService,
  CoachUpsertConflictError,
  CompetitionsService,
  CompetitionUpsertConflictError,
  ErasService,
  EraUpsertConflictError,
  ExternalSystemsService,
  LeaguesService,
  LeagueUpsertConflictError,
  MatchesService,
  MatchEventsService,
  MatchEventUpsertConflictError,
  MatchOutcomesService,
  MatchUpsertConflictError,
  PlayersService,
  PlayerUpsertConflictError,
  PositionsService,
  PositionUpsertConflictError,
  RacesService,
  RaceUpsertConflictError,
  RulesSetsService,
  RulesSetUpsertConflictError,
  SppAwardValuesService,
  SppTotalsService,
  TeamsService,
  TeamUpsertConflictError,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { call } from '@orpc/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { RpcRouterFactoryService } from './rpc-router-factory.service';
import type { ConflictErrors } from './upsert-handler.service';
import { UpsertHandlerService } from './upsert-handler.service';

describe('RpcRouterFactoryService', () => {
  let router: ReturnType<RpcRouterFactoryService['build']>;
  let coachesService: MockProxy<CoachesService>;
  let externalSystemsService: MockProxy<ExternalSystemsService>;
  let leaguesService: MockProxy<LeaguesService>;
  let racesService: MockProxy<RacesService>;
  let rulesSetsService: MockProxy<RulesSetsService>;
  let erasService: MockProxy<ErasService>;
  let positionsService: MockProxy<PositionsService>;
  let teamsService: MockProxy<TeamsService>;
  let competitionsService: MockProxy<CompetitionsService>;
  let matchesService: MockProxy<MatchesService>;
  let matchOutcomesService: MockProxy<MatchOutcomesService>;
  let playersService: MockProxy<PlayersService>;
  let matchEventsService: MockProxy<MatchEventsService>;
  let sppAwardValuesService: MockProxy<SppAwardValuesService>;
  let sppTotalsService: MockProxy<SppTotalsService>;
  let upsertHandler: MockProxy<UpsertHandlerService>;

  beforeEach(async () => {
    coachesService = mock<CoachesService>();
    externalSystemsService = mock<ExternalSystemsService>();
    leaguesService = mock<LeaguesService>();
    racesService = mock<RacesService>();
    rulesSetsService = mock<RulesSetsService>();
    erasService = mock<ErasService>();
    positionsService = mock<PositionsService>();
    teamsService = mock<TeamsService>();
    competitionsService = mock<CompetitionsService>();
    matchesService = mock<MatchesService>();
    matchOutcomesService = mock<MatchOutcomesService>();
    playersService = mock<PlayersService>();
    matchEventsService = mock<MatchEventsService>();
    sppAwardValuesService = mock<SppAwardValuesService>();
    sppTotalsService = mock<SppTotalsService>();
    upsertHandler = mock<UpsertHandlerService>();
    // Mirrors UpsertHandlerService's real implementation (see
    // upsert-handler.service.ts / its own spec for coverage of this logic in
    // isolation) so these tests keep verifying how RpcRouterFactoryService
    // wires each entity service and conflict-error class into the handler,
    // rather than degrading into an assertion on a hardcoded stub value.
    upsertHandler.run.mockImplementation(
      async (errors: ConflictErrors, conflictErrorClass, runUpsert) => {
        try {
          const { entity, created } = (await runUpsert()) as {
            entity: Record<string, unknown>;
            created: boolean;
          };
          return { ...entity, created };
        } catch (err) {
          if (err instanceof conflictErrorClass) {
            throw errors.CONFLICT({ message: err.message });
          }
          throw err;
        }
      },
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        RpcRouterFactoryService,
        { provide: CoachesService, useValue: coachesService },
        { provide: ExternalSystemsService, useValue: externalSystemsService },
        { provide: LeaguesService, useValue: leaguesService },
        { provide: RacesService, useValue: racesService },
        { provide: RulesSetsService, useValue: rulesSetsService },
        { provide: ErasService, useValue: erasService },
        { provide: PositionsService, useValue: positionsService },
        { provide: TeamsService, useValue: teamsService },
        { provide: CompetitionsService, useValue: competitionsService },
        { provide: MatchesService, useValue: matchesService },
        { provide: MatchOutcomesService, useValue: matchOutcomesService },
        { provide: PlayersService, useValue: playersService },
        { provide: MatchEventsService, useValue: matchEventsService },
        { provide: SppAwardValuesService, useValue: sppAwardValuesService },
        { provide: SppTotalsService, useValue: sppTotalsService },
        { provide: UpsertHandlerService, useValue: upsertHandler },
      ],
    }).compile();
    router = moduleRef.get(RpcRouterFactoryService).build();
  });

  it('coaches.upsert returns the flat entity with a created flag', async () => {
    coachesService.upsert.mockResolvedValue({
      coach: {
        id: 1,
        name: 'Roze Madder',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        historyVersion: 1,
        historyPeriod: '["2026-01-01 00:00:00+00",)',
      },
      created: true,
    });

    const result = await call(router.coaches.upsert, {
      name: 'Roze Madder',
      externalIds: [{ externalSystemId: 1, externalId: 'e1' }],
    });

    expect(result).toEqual({
      id: 1,
      name: 'Roze Madder',
      createdAt: new Date('2026-01-01'),
      created: true,
    });
  });

  it('coaches.upsert throws CONFLICT when the service reports a conflict', async () => {
    coachesService.upsert.mockRejectedValue(
      new CoachUpsertConflictError(
        'External IDs matched multiple existing coaches: 1, 2',
      ),
    );

    await expect(
      call(router.coaches.upsert, {
        name: 'Roze Madder',
        externalIds: [{ externalSystemId: 1, externalId: 'e1' }],
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'External IDs matched multiple existing coaches: 1, 2',
    });
  });

  it('coaches.upsert rethrows errors that are not a conflict', async () => {
    coachesService.upsert.mockRejectedValue(new Error('db unavailable'));

    await expect(
      call(router.coaches.upsert, {
        name: 'Roze Madder',
        externalIds: [{ externalSystemId: 1, externalId: 'e1' }],
      }),
    ).rejects.toThrow('db unavailable');
  });

  it('externalSystems.upsert returns the flat entity with a created flag', async () => {
    externalSystemsService.upsert.mockResolvedValue({
      system: {
        id: 1,
        name: 'BBL',
        category: 'imported_data_source',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        historyVersion: 1,
        historyPeriod: '["2026-01-01 00:00:00+00",)',
      },
      created: false,
    });

    const result = await call(router.externalSystems.upsert, {
      name: 'BBL',
      category: 'imported_data_source',
    });

    expect(result).toEqual({
      id: 1,
      name: 'BBL',
      category: 'imported_data_source',
      createdAt: new Date('2026-01-01'),
      created: false,
    });
  });

  it('leagues.upsert returns the flat entity with a created flag', async () => {
    leaguesService.upsert.mockResolvedValue({
      league: {
        id: 1,
        name: 'Test League',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        historyVersion: 1,
        historyPeriod: '["2026-01-01 00:00:00+00",)',
      },
      created: true,
    });

    const result = await call(router.leagues.upsert, {
      name: 'Test League',
      externalIds: [{ externalSystemId: 1, externalId: 'e1' }],
    });

    expect(result).toEqual({
      id: 1,
      name: 'Test League',
      createdAt: new Date('2026-01-01'),
      created: true,
    });
  });

  it('leagues.upsert throws CONFLICT when the service reports a conflict', async () => {
    leaguesService.upsert.mockRejectedValue(
      new LeagueUpsertConflictError(
        'External IDs matched multiple existing leagues: 1, 2',
      ),
    );

    await expect(
      call(router.leagues.upsert, {
        name: 'Test League',
        externalIds: [{ externalSystemId: 1, externalId: 'e1' }],
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'External IDs matched multiple existing leagues: 1, 2',
    });
  });

  it('leagues.upsert rethrows errors that are not a conflict', async () => {
    leaguesService.upsert.mockRejectedValue(new Error('db unavailable'));

    await expect(
      call(router.leagues.upsert, {
        name: 'Test League',
        externalIds: [{ externalSystemId: 1, externalId: 'e1' }],
      }),
    ).rejects.toThrow('db unavailable');
  });

  it('races.upsert returns the flat entity with a created flag', async () => {
    racesService.upsert.mockResolvedValue({
      race: {
        id: 1,
        name: 'Orc',
        eras: [5],
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        historyVersion: 1,
        historyPeriod: '["2026-01-01 00:00:00+00",)',
      },
      created: true,
    });

    const result = await call(router.races.upsert, {
      name: 'Orc',
      eras: [5],
      externalIds: [{ externalSystemId: 1, externalId: 'e1' }],
    });

    expect(result).toEqual({
      id: 1,
      name: 'Orc',
      eras: [5],
      createdAt: new Date('2026-01-01'),
      created: true,
    });
  });

  it('races.upsert throws CONFLICT when the service reports a conflict', async () => {
    racesService.upsert.mockRejectedValue(
      new RaceUpsertConflictError(
        'External IDs matched multiple existing races: 1, 2',
      ),
    );

    await expect(
      call(router.races.upsert, {
        name: 'Orc',
        externalIds: [{ externalSystemId: 1, externalId: 'e1' }],
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'External IDs matched multiple existing races: 1, 2',
    });
  });

  it('races.upsert rethrows errors that are not a conflict', async () => {
    racesService.upsert.mockRejectedValue(new Error('db unavailable'));

    await expect(
      call(router.races.upsert, {
        name: 'Orc',
        externalIds: [{ externalSystemId: 1, externalId: 'e1' }],
      }),
    ).rejects.toThrow('db unavailable');
  });

  it('rulesSets.upsert returns the flat entity with a created flag', async () => {
    rulesSetsService.upsert.mockResolvedValue({
      rulesSet: {
        id: 1,
        name: 'BB2020',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        historyVersion: 1,
        historyPeriod: '["2026-01-01 00:00:00+00",)',
      },
      created: true,
    });

    const result = await call(router.rulesSets.upsert, {
      name: 'BB2020',
      externalIds: [{ externalSystemId: 1, externalId: 'BB2020' }],
    });

    expect(result).toEqual({
      id: 1,
      name: 'BB2020',
      createdAt: new Date('2026-01-01'),
      created: true,
    });
  });

  it('rulesSets.upsert throws CONFLICT when the service reports a conflict', async () => {
    rulesSetsService.upsert.mockRejectedValue(
      new RulesSetUpsertConflictError(
        'External IDs matched multiple existing rules sets: 1, 2',
      ),
    );

    await expect(
      call(router.rulesSets.upsert, {
        name: 'BB2020',
        externalIds: [{ externalSystemId: 1, externalId: 'BB2020' }],
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'External IDs matched multiple existing rules sets: 1, 2',
    });
  });

  it('rulesSets.upsert rethrows errors that are not a conflict', async () => {
    rulesSetsService.upsert.mockRejectedValue(new Error('db unavailable'));

    await expect(
      call(router.rulesSets.upsert, {
        name: 'BB2020',
        externalIds: [{ externalSystemId: 1, externalId: 'BB2020' }],
      }),
    ).rejects.toThrow('db unavailable');
  });

  it('eras.upsert returns the flat entity with a created flag', async () => {
    erasService.upsert.mockResolvedValue({
      era: {
        id: 1,
        name: 'BB2020',
        leagueId: 10,
        rulesSetIds: [20],
        startDate: '2021-09-01',
        endDate: '2023-06-10',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        historyVersion: 1,
        historyPeriod: '["2026-01-01 00:00:00+00",)',
      },
      created: true,
    });

    const result = await call(router.eras.upsert, {
      name: 'BB2020',
      leagueId: 10,
      rulesSetIds: [20],
      startDate: '2021-09-01',
      endDate: '2023-06-10',
      externalIds: [{ externalSystemId: 1, externalId: 'BB2020' }],
    });

    expect(result).toEqual({
      id: 1,
      name: 'BB2020',
      leagueId: 10,
      rulesSetIds: [20],
      startDate: '2021-09-01',
      endDate: '2023-06-10',
      createdAt: new Date('2026-01-01'),
      created: true,
    });
  });

  it('eras.upsert throws CONFLICT when the service reports a conflict', async () => {
    erasService.upsert.mockRejectedValue(
      new EraUpsertConflictError(
        'External IDs matched multiple existing eras: 1, 2',
      ),
    );

    await expect(
      call(router.eras.upsert, {
        name: 'BB2020',
        leagueId: 10,
        rulesSetIds: [20],
        startDate: '2021-09-01',
        externalIds: [{ externalSystemId: 1, externalId: 'BB2020' }],
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'External IDs matched multiple existing eras: 1, 2',
    });
  });

  it('eras.upsert rethrows errors that are not a conflict', async () => {
    erasService.upsert.mockRejectedValue(new Error('db unavailable'));

    await expect(
      call(router.eras.upsert, {
        name: 'BB2020',
        leagueId: 10,
        rulesSetIds: [20],
        startDate: '2021-09-01',
        externalIds: [{ externalSystemId: 1, externalId: 'BB2020' }],
      }),
    ).rejects.toThrow('db unavailable');
  });

  it('positions.upsert returns the flat entity with a created flag', async () => {
    positionsService.upsert.mockResolvedValue({
      position: {
        id: 1,
        name: 'Lineman',
        isStarPlayer: false,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        historyVersion: 1,
        historyPeriod: '["2026-01-01 00:00:00+00",)',
      },
      created: true,
    });

    const result = await call(router.positions.upsert, {
      name: 'Lineman',
      isStarPlayer: false,
      externalIds: [{ externalSystemId: 1, externalId: '10-7' }],
    });

    expect(result).toEqual({
      id: 1,
      name: 'Lineman',
      isStarPlayer: false,
      createdAt: new Date('2026-01-01'),
      created: true,
    });
  });

  it('positions.syncRaceEras forwards input and returns the service result unchanged', async () => {
    positionsService.syncRaceEras.mockResolvedValue({
      positionId: 1,
      raceEraIds: [10, 11],
    });

    const input = {
      positionId: 1,
      raceEras: [
        { raceId: 7, eraId: 1 },
        { raceId: 7, eraId: 2 },
      ],
    };
    const result = await call(router.positions.syncRaceEras, input);

    expect(positionsService.syncRaceEras).toHaveBeenCalledWith(input);
    expect(result).toEqual({
      positionId: 1,
      raceEraIds: [10, 11],
    });
  });

  it('positions.upsert throws CONFLICT when the service reports a conflict', async () => {
    positionsService.upsert.mockRejectedValue(
      new PositionUpsertConflictError(
        'External IDs matched multiple existing positions: 1, 2',
      ),
    );

    await expect(
      call(router.positions.upsert, {
        name: 'Lineman',
        isStarPlayer: false,
        externalIds: [{ externalSystemId: 1, externalId: '10-7' }],
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'External IDs matched multiple existing positions: 1, 2',
    });
  });

  it('positions.upsert rethrows errors that are not a conflict', async () => {
    positionsService.upsert.mockRejectedValue(new Error('db unavailable'));

    await expect(
      call(router.positions.upsert, {
        name: 'Lineman',
        isStarPlayer: false,
        externalIds: [{ externalSystemId: 1, externalId: '10-7' }],
      }),
    ).rejects.toThrow('db unavailable');
  });

  it('teams.upsert returns the flat entity with a created flag', async () => {
    teamsService.upsert.mockResolvedValue({
      team: {
        id: 1,
        name: '40 grinders',
        raceId: 5,
        coachId: 9,
        eras: [],
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        historyVersion: 1,
        historyPeriod: '["2026-01-01 00:00:00+00",)',
      },
      created: true,
    });

    const result = await call(router.teams.upsert, {
      name: '40 grinders',
      raceId: 5,
      coachId: 9,
      externalIds: [{ externalSystemId: 1, externalId: '40g' }],
    });

    expect(result).toEqual({
      id: 1,
      name: '40 grinders',
      raceId: 5,
      coachId: 9,
      eras: [],
      createdAt: new Date('2026-01-01'),
      created: true,
    });
  });

  it('teams.upsert throws CONFLICT when the service reports a conflict', async () => {
    teamsService.upsert.mockRejectedValue(
      new TeamUpsertConflictError(
        'External IDs matched multiple existing teams: 1, 2',
      ),
    );

    await expect(
      call(router.teams.upsert, {
        name: '40 grinders',
        raceId: 5,
        coachId: 9,
        externalIds: [{ externalSystemId: 1, externalId: '40g' }],
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'External IDs matched multiple existing teams: 1, 2',
    });
  });

  it('teams.upsert rethrows errors that are not a conflict', async () => {
    teamsService.upsert.mockRejectedValue(new Error('db unavailable'));

    await expect(
      call(router.teams.upsert, {
        name: '40 grinders',
        raceId: 5,
        coachId: 9,
        externalIds: [{ externalSystemId: 1, externalId: '40g' }],
      }),
    ).rejects.toThrow('db unavailable');
  });

  it('competitions.upsert returns the flat entity with a created flag', async () => {
    competitionsService.upsert.mockResolvedValue({
      competition: {
        id: 1,
        name: 'Major Season 24',
        type: 'season',
        eraId: 20,
        teamEraIds: [],
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        historyVersion: 1,
        historyPeriod: '["2026-01-01 00:00:00+00",)',
      },
      created: true,
    });

    const result = await call(router.competitions.upsert, {
      name: 'Major Season 24',
      type: 'season',
      eraId: 20,
      externalIds: [{ externalSystemId: 1, externalId: '73' }],
    });

    expect(result).toEqual({
      id: 1,
      name: 'Major Season 24',
      type: 'season',
      eraId: 20,
      teamEraIds: [],
      createdAt: new Date('2026-01-01'),
      created: true,
    });
  });

  it('competitions.upsert throws CONFLICT when the service reports a conflict', async () => {
    competitionsService.upsert.mockRejectedValue(
      new CompetitionUpsertConflictError(
        'External IDs matched multiple existing competitions: 1, 2',
      ),
    );

    await expect(
      call(router.competitions.upsert, {
        name: 'Major Season 24',
        type: 'season',
        eraId: 20,
        externalIds: [{ externalSystemId: 1, externalId: '73' }],
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'External IDs matched multiple existing competitions: 1, 2',
    });
  });

  it('competitions.upsert rethrows errors that are not a conflict', async () => {
    competitionsService.upsert.mockRejectedValue(new Error('db unavailable'));

    await expect(
      call(router.competitions.upsert, {
        name: 'Major Season 24',
        type: 'season',
        eraId: 20,
        externalIds: [{ externalSystemId: 1, externalId: '73' }],
      }),
    ).rejects.toThrow('db unavailable');
  });

  it('matches.upsert returns the flat entity with a created flag', async () => {
    matchesService.upsert.mockResolvedValue({
      match: {
        id: 1,
        competitionId: 20,
        teamEraIds: [100, 101],
        name: 'Final',
        category: 'season_final',
        playedAt: new Date('2021-09-25'),
        winningMatchTeamId: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        historyVersion: 1,
        historyPeriod: '["2026-01-01 00:00:00+00",)',
      },
      created: true,
    });

    const result = await call(router.matches.upsert, {
      competitionId: 20,
      playedAt: new Date('2021-09-25'),
      name: 'Final',
      category: 'season_final',
      externalIds: [{ externalSystemId: 1, externalId: '89' }],
    });

    expect(result).toEqual({
      id: 1,
      competitionId: 20,
      teamEraIds: [100, 101],
      name: 'Final',
      category: 'season_final',
      playedAt: new Date('2021-09-25'),
      createdAt: new Date('2026-01-01'),
      created: true,
    });
  });

  it('matches.upsert throws CONFLICT when the service reports a conflict', async () => {
    matchesService.upsert.mockRejectedValue(
      new MatchUpsertConflictError(
        'External IDs matched multiple existing matches: 1, 2',
      ),
    );

    await expect(
      call(router.matches.upsert, {
        competitionId: 20,
        playedAt: new Date('2021-09-25'),
        name: 'Final',
        category: 'season_final',
        externalIds: [{ externalSystemId: 1, externalId: '89' }],
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'External IDs matched multiple existing matches: 1, 2',
    });
  });

  it('matches.upsert rethrows errors that are not a conflict', async () => {
    matchesService.upsert.mockRejectedValue(new Error('db unavailable'));

    await expect(
      call(router.matches.upsert, {
        competitionId: 20,
        playedAt: new Date('2021-09-25'),
        name: 'Final',
        category: 'season_final',
        externalIds: [{ externalSystemId: 1, externalId: '89' }],
      }),
    ).rejects.toThrow('db unavailable');
  });

  it('delegates matches.resolveOutcomes to MatchOutcomesService', async () => {
    const expected = {
      competitionId: 7,
      resolvedMatchIds: [1, 2],
      unresolvedMatchIds: [3],
    };
    matchOutcomesService.resolveForCompetition.mockResolvedValue(expected);

    const input = {
      competitionId: 7,
      overrides: [],
      tieBreaks: [{ matchId: 3, winnerTeamEraId: null }],
    };
    const result = await call(router.matches.resolveOutcomes, input);

    expect(result).toEqual(expected);
    expect(matchOutcomesService.resolveForCompetition).toHaveBeenCalledWith(
      input,
    );
  });

  it('players.upsert returns the flat entity with a created flag', async () => {
    playersService.upsert.mockResolvedValue({
      player: {
        id: 1,
        name: 'Griff Oberwald',
        teamEraId: 10,
        positionId: 20,
        sppTotal: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        historyVersion: 1,
        historyPeriod: '["2026-01-01 00:00:00+00",)',
      },
      created: true,
    });

    const result = await call(router.players.upsert, {
      name: 'Griff Oberwald',
      teamEraId: 10,
      positionId: 20,
      externalIds: [{ externalSystemId: 1, externalId: '12345' }],
    });

    expect(result).toEqual({
      id: 1,
      name: 'Griff Oberwald',
      teamEraId: 10,
      positionId: 20,
      createdAt: new Date('2026-01-01'),
      created: true,
    });
  });

  it('players.upsert throws CONFLICT when the service reports a conflict', async () => {
    playersService.upsert.mockRejectedValue(
      new PlayerUpsertConflictError(
        'External IDs matched multiple existing players: 1, 2',
      ),
    );

    await expect(
      call(router.players.upsert, {
        name: 'Griff Oberwald',
        teamEraId: 10,
        positionId: 20,
        externalIds: [{ externalSystemId: 1, externalId: '12345' }],
      }),
    ).rejects.toThrow();
  });

  it('matchEvents.upsert returns the flat entity with a created flag', async () => {
    matchEventsService.upsert.mockResolvedValue({
      matchEvent: {
        id: 1,
        matchId: 10,
        actingMatchTeamId: 100,
        consequenceMatchTeamId: null,
        actingPlayerId: 9,
        consequencePlayerId: null,
        actionType: 'touchdown',
        consequenceType: null,
        actingUnidentifiedKind: null,
        consequenceUnidentifiedKind: null,
        consequenceAvoidedBy: null,
        consequenceAvoidedSeverity: null,
        eventType: null,
        weatherType: null,
        inducementsCost: null,
        inducementsFromTreasury: null,
        winnings: null,
        fanFactor: null,
        journeymenCount: null,
        prayersToNuffle: null,
        dedicatedFans: null,
        secretObjective: null,
        expensiveMistake: null,
        sppValue: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        historyVersion: 1,
        historyPeriod: '["2026-01-01 00:00:00+00",)',
      },
      created: true,
    });

    const result = await call(router.matchEvents.upsert, {
      matchId: 10,
      actingTeamEraId: 100,
      actingPlayerId: 9,
      actionType: 'touchdown',
      externalIds: [{ externalSystemId: 1, externalId: '1000-vor-td-0' }],
    });

    expect(result).toMatchObject({
      id: 1,
      actionType: 'touchdown',
      created: true,
    });
  });

  it('matchEvents.upsert throws CONFLICT when the service reports a conflict', async () => {
    matchEventsService.upsert.mockRejectedValue(
      new MatchEventUpsertConflictError(
        'External IDs matched multiple existing match events: 1, 2',
      ),
    );

    await expect(
      call(router.matchEvents.upsert, {
        matchId: 10,
        actingTeamEraId: 100,
        actingPlayerId: 9,
        actionType: 'touchdown',
        externalIds: [{ externalSystemId: 1, externalId: '1000-vor-td-0' }],
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'External IDs matched multiple existing match events: 1, 2',
    });
  });

  it('matchEvents.upsert rethrows errors that are not a conflict', async () => {
    matchEventsService.upsert.mockRejectedValue(new Error('db unavailable'));

    await expect(
      call(router.matchEvents.upsert, {
        matchId: 10,
        actingTeamEraId: 100,
        actingPlayerId: 9,
        actionType: 'touchdown',
        externalIds: [{ externalSystemId: 1, externalId: '1000-vor-td-0' }],
      }),
    ).rejects.toThrow('db unavailable');
  });

  it('routes sppAwardValues.sync to SppAwardValuesService.sync', async () => {
    sppAwardValuesService.sync.mockResolvedValue({ sppAwardValueIds: [11] });

    const input = {
      values: [
        {
          rulesSetId: 1,
          raceId: null,
          actionType: 'touchdown' as const,
          sppValue: 3,
        },
      ],
    };
    const result = await call(router.sppAwardValues.sync, input);

    expect(result).toEqual({ sppAwardValueIds: [11] });
    expect(sppAwardValuesService.sync).toHaveBeenCalledWith(input);
  });

  it('routes players.syncComputedSppTotals to SppTotalsService.syncComputedTotals', async () => {
    sppTotalsService.syncComputedTotals.mockResolvedValue({
      updatedPlayerIds: [1, 2],
    });

    const input = { playerIds: [1, 2] };
    const result = await call(router.players.syncComputedSppTotals, input);

    expect(result).toEqual({ updatedPlayerIds: [1, 2] });
    expect(sppTotalsService.syncComputedTotals).toHaveBeenCalledWith(input);
  });
});
