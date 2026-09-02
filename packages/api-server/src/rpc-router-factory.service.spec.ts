import {
  CharacteristicFormatMismatchError,
  CoachesService,
  CoachUpsertConflictError,
  CompetitionGroupsService,
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
  MissingRequiredFieldError,
  PlayersService,
  PlayerUpsertConflictError,
  PositionRulesSetsService,
  PositionsService,
  PositionUpsertConflictError,
  RacesService,
  RaceUpsertConflictError,
  RulesSetsService,
  RulesSetUpsertConflictError,
  SppAdjustmentsService,
  SppAwardValuesService,
  TeamsService,
  TeamUpsertConflictError,
  TrophiesService,
  TrophyAwardsService,
  TrophyUpsertConflictError,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { call } from '@orpc/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { RpcRouterFactoryService } from './rpc-router-factory.service';
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
  let trophiesService: MockProxy<TrophiesService>;
  let trophyAwardsService: MockProxy<TrophyAwardsService>;
  let competitionGroupsService: MockProxy<CompetitionGroupsService>;
  let competitionsService: MockProxy<CompetitionsService>;
  let matchesService: MockProxy<MatchesService>;
  let matchOutcomesService: MockProxy<MatchOutcomesService>;
  let playersService: MockProxy<PlayersService>;
  let matchEventsService: MockProxy<MatchEventsService>;
  let sppAdjustmentsService: MockProxy<SppAdjustmentsService>;
  let sppAwardValuesService: MockProxy<SppAwardValuesService>;
  let positionRulesSetsService: MockProxy<PositionRulesSetsService>;

  beforeEach(async () => {
    coachesService = mock<CoachesService>();
    externalSystemsService = mock<ExternalSystemsService>();
    leaguesService = mock<LeaguesService>();
    racesService = mock<RacesService>();
    rulesSetsService = mock<RulesSetsService>();
    erasService = mock<ErasService>();
    positionsService = mock<PositionsService>();
    teamsService = mock<TeamsService>();
    trophiesService = mock<TrophiesService>();
    trophyAwardsService = mock<TrophyAwardsService>();
    competitionGroupsService = mock<CompetitionGroupsService>();
    competitionsService = mock<CompetitionsService>();
    matchesService = mock<MatchesService>();
    matchOutcomesService = mock<MatchOutcomesService>();
    playersService = mock<PlayersService>();
    matchEventsService = mock<MatchEventsService>();
    sppAdjustmentsService = mock<SppAdjustmentsService>();
    sppAwardValuesService = mock<SppAwardValuesService>();
    positionRulesSetsService = mock<PositionRulesSetsService>();

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
        { provide: TrophiesService, useValue: trophiesService },
        { provide: TrophyAwardsService, useValue: trophyAwardsService },
        {
          provide: CompetitionGroupsService,
          useValue: competitionGroupsService,
        },
        { provide: CompetitionsService, useValue: competitionsService },
        { provide: MatchesService, useValue: matchesService },
        { provide: MatchOutcomesService, useValue: matchOutcomesService },
        { provide: PlayersService, useValue: playersService },
        { provide: MatchEventsService, useValue: matchEventsService },
        { provide: SppAdjustmentsService, useValue: sppAdjustmentsService },
        { provide: SppAwardValuesService, useValue: sppAwardValuesService },
        {
          provide: PositionRulesSetsService,
          useValue: positionRulesSetsService,
        },
        UpsertHandlerService,
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
        moveFormat: 'bare',
        strengthFormat: 'bare',
        agilityFormat: 'bare',
        passingFormat: 'plus',
        armourFormat: 'bare',
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
      moveFormat: 'bare',
      strengthFormat: 'bare',
      agilityFormat: 'bare',
      passingFormat: 'plus',
      armourFormat: 'bare',
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
        competitionGroupId: 5,
        teamEraIds: [],
        startDate: '2024-01-15',
        endDate: null,
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
      competitionGroupId: 5,
      teamEraIds: [],
      startDate: '2024-01-15',
      endDate: null,
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
        move: 6,
        strength: 3,
        agility: 3,
        passing: 4,
        armour: 9,
        sppTotal: null,
        sppAdjustment: null,
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
      move: 6,
      strength: 3,
      agility: 3,
      passing: 4,
      armour: 9,
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

  it('players.upsert maps a characteristic format mismatch to BAD_REQUEST', async () => {
    playersService.upsert.mockRejectedValue(
      new CharacteristicFormatMismatchError(
        'Rules set 5 has no Passing characteristic, but player 1:12345 supplies one',
      ),
    );

    await expect(
      call(router.players.upsert, {
        name: 'Griff Oberwald',
        move: 6,
        strength: 3,
        agility: 3,
        passing: 4,
        armour: 8,
        rulesSetId: 5,
        externalIds: [{ externalSystemId: 1, externalId: '12345' }],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
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

  describe('positionRulesSets.sync', () => {
    it('delegates to the position rules sets service', async () => {
      positionRulesSetsService.sync.mockResolvedValue({
        positionRulesSetIds: [21],
      });
      const input = {
        entries: [
          {
            positionId: 3,
            rulesSetId: 4,
            move: 6,
            strength: 3,
            agility: 3,
            passing: 4,
            armour: 9,
          },
        ],
      };

      const result = await call(router.positionRulesSets.sync, input);

      expect(result).toEqual({ positionRulesSetIds: [21] });
      expect(positionRulesSetsService.sync).toHaveBeenCalledWith(input);
    });

    it('maps a format mismatch to BAD_REQUEST', async () => {
      positionRulesSetsService.sync.mockRejectedValue(
        new CharacteristicFormatMismatchError('Rules set 5 has no Passing'),
      );

      await expect(
        call(router.positionRulesSets.sync, { entries: [] }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });

    it('lets an unrelated failure through untouched', async () => {
      positionRulesSetsService.sync.mockRejectedValue(
        new Error('connection lost'),
      );

      await expect(
        call(router.positionRulesSets.sync, { entries: [] }),
      ).rejects.toThrow('connection lost');
    });
  });

  it('routes players.syncScrapedSppAdjustments to SppAdjustmentsService.syncScrapedAdjustments', async () => {
    sppAdjustmentsService.syncScrapedAdjustments.mockResolvedValue({
      updatedPlayerIds: [1, 2],
    });

    const input = {
      players: [
        { playerId: 1, scrapedTotal: 16 },
        { playerId: 2, scrapedTotal: null },
      ],
    };
    const result = await call(router.players.syncScrapedSppAdjustments, input);

    expect(result).toEqual({ updatedPlayerIds: [1, 2] });
    expect(sppAdjustmentsService.syncScrapedAdjustments).toHaveBeenCalledWith(
      input,
    );
  });

  it('routes players.syncReportedSppAdjustments to SppAdjustmentsService.syncReportedAdjustments', async () => {
    sppAdjustmentsService.syncReportedAdjustments.mockResolvedValue({
      updatedPlayerIds: [3],
    });

    const input = { players: [{ playerId: 3 }, { playerId: 4 }] };
    const result = await call(router.players.syncReportedSppAdjustments, input);

    expect(result).toEqual({ updatedPlayerIds: [3] });
    expect(sppAdjustmentsService.syncReportedAdjustments).toHaveBeenCalledWith(
      input,
    );
  });

  describe('trophies.upsert', () => {
    it('returns the flattened trophy with its created flag', async () => {
      const trophy = {
        id: 3,
        name: 'Chaos Cup',
        recipientKind: 'team' as const,
        description: null,
        competitionGroupId: 5,
        leagueId: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        historyVersion: 1,
        historyPeriod: '["2026-01-01 00:00:00+00",)',
      };
      trophiesService.upsert.mockResolvedValue({ trophy, created: true });

      const result = await call(router.trophies.upsert, {
        name: 'Chaos Cup',
        recipientKind: 'team',
        externalIds: [{ externalSystemId: 1, externalId: 'Chaos Cup' }],
      });

      expect(result).toEqual({
        id: 3,
        name: 'Chaos Cup',
        recipientKind: 'team',
        description: null,
        competitionGroupId: 5,
        leagueId: null,
        createdAt: new Date('2026-01-01'),
        created: true,
      });
    });

    it('maps a TrophyUpsertConflictError to CONFLICT', async () => {
      trophiesService.upsert.mockRejectedValue(
        new TrophyUpsertConflictError('two trophies'),
      );

      await expect(
        call(router.trophies.upsert, {
          externalIds: [{ externalSystemId: 1, externalId: 'Chaos Cup' }],
        }),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('maps a MissingRequiredFieldError to BAD_REQUEST', async () => {
      trophiesService.upsert.mockRejectedValue(
        new MissingRequiredFieldError('missing recipientKind'),
      );

      await expect(
        call(router.trophies.upsert, {
          externalIds: [{ externalSystemId: 1, externalId: 'Chaos Cup' }],
        }),
      ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    });
  });
});
