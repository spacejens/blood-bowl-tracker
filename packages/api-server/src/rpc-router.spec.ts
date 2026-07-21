import type {
  CoachesService,
  CompetitionsService,
  ErasService,
  ExternalSystemsService,
  LeaguesService,
  MatchesService,
  MatchEventsService,
  PlayersService,
  PositionsService,
  RacesService,
  RulesSetsService,
  TeamsService,
} from '@blood-bowl-tracker/game-data';
import {
  CoachUpsertConflictError,
  CompetitionUpsertConflictError,
  EraUpsertConflictError,
  LeagueUpsertConflictError,
  MatchEventUpsertConflictError,
  MatchUpsertConflictError,
  PlayerUpsertConflictError,
  PositionUpsertConflictError,
  RaceUpsertConflictError,
  RulesSetUpsertConflictError,
  TeamUpsertConflictError,
} from '@blood-bowl-tracker/game-data';
import { call } from '@orpc/server';
import { describe, expect, it, vi } from 'vitest';

import { buildRpcRouter } from './rpc-router';

function makeServices() {
  return {
    coachesService: { upsert: vi.fn() } as unknown as CoachesService,
    externalSystemsService: {
      upsert: vi.fn(),
    } as unknown as ExternalSystemsService,
    leaguesService: { upsert: vi.fn() } as unknown as LeaguesService,
    racesService: { upsert: vi.fn() } as unknown as RacesService,
    rulesSetsService: { upsert: vi.fn() } as unknown as RulesSetsService,
    erasService: { upsert: vi.fn() } as unknown as ErasService,
    positionsService: {
      upsert: vi.fn(),
      syncRaceEras: vi.fn(),
    } as unknown as PositionsService,
    teamsService: { upsert: vi.fn() } as unknown as TeamsService,
    competitionsService: {
      upsert: vi.fn(),
    } as unknown as CompetitionsService,
    matchesService: { upsert: vi.fn() } as unknown as MatchesService,
    playersService: { upsert: vi.fn() } as unknown as PlayersService,
    matchEventsService: {
      upsert: vi.fn(),
    } as unknown as MatchEventsService,
  };
}

describe('buildRpcRouter', () => {
  it('coaches.upsert returns the flat entity with a created flag', async () => {
    const services = makeServices();
    const { coachesService } = services;
    (coachesService.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
      coach: { id: 1, name: 'Roze Madder', createdAt: new Date('2026-01-01') },
      created: true,
    });
    const router = buildRpcRouter(services);

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
    const services = makeServices();
    const { coachesService } = services;
    (coachesService.upsert as ReturnType<typeof vi.fn>).mockRejectedValue(
      new CoachUpsertConflictError(
        'External IDs matched multiple existing coaches: 1, 2',
      ),
    );
    const router = buildRpcRouter(services);

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
    const services = makeServices();
    const { coachesService } = services;
    (coachesService.upsert as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('db unavailable'),
    );
    const router = buildRpcRouter(services);

    await expect(
      call(router.coaches.upsert, {
        name: 'Roze Madder',
        externalIds: [{ externalSystemId: 1, externalId: 'e1' }],
      }),
    ).rejects.toThrow('db unavailable');
  });

  it('externalSystems.upsert returns the flat entity with a created flag', async () => {
    const services = makeServices();
    const { externalSystemsService } = services;
    (
      externalSystemsService.upsert as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      system: {
        id: 1,
        name: 'BBL',
        isBookkeeping: false,
        createdAt: new Date('2026-01-01'),
      },
      created: false,
    });
    const router = buildRpcRouter(services);

    const result = await call(router.externalSystems.upsert, {
      name: 'BBL',
      isBookkeeping: false,
    });

    expect(result).toEqual({
      id: 1,
      name: 'BBL',
      isBookkeeping: false,
      createdAt: new Date('2026-01-01'),
      created: false,
    });
  });

  it('leagues.upsert returns the flat entity with a created flag', async () => {
    const services = makeServices();
    const { leaguesService } = services;
    (leaguesService.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
      league: {
        id: 1,
        name: 'Test League',
        createdAt: new Date('2026-01-01'),
      },
      created: true,
    });
    const router = buildRpcRouter(services);

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
    const services = makeServices();
    const { leaguesService } = services;
    (leaguesService.upsert as ReturnType<typeof vi.fn>).mockRejectedValue(
      new LeagueUpsertConflictError(
        'External IDs matched multiple existing leagues: 1, 2',
      ),
    );
    const router = buildRpcRouter(services);

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
    const services = makeServices();
    const { leaguesService } = services;
    (leaguesService.upsert as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('db unavailable'),
    );
    const router = buildRpcRouter(services);

    await expect(
      call(router.leagues.upsert, {
        name: 'Test League',
        externalIds: [{ externalSystemId: 1, externalId: 'e1' }],
      }),
    ).rejects.toThrow('db unavailable');
  });

  it('races.upsert returns the flat entity with a created flag', async () => {
    const services = makeServices();
    const { racesService } = services;
    (racesService.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
      race: {
        id: 1,
        name: 'Orc',
        eras: [5],
        createdAt: new Date('2026-01-01'),
      },
      created: true,
    });
    const router = buildRpcRouter(services);

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
    const services = makeServices();
    const { racesService } = services;
    (racesService.upsert as ReturnType<typeof vi.fn>).mockRejectedValue(
      new RaceUpsertConflictError(
        'External IDs matched multiple existing races: 1, 2',
      ),
    );
    const router = buildRpcRouter(services);

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
    const services = makeServices();
    const { racesService } = services;
    (racesService.upsert as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('db unavailable'),
    );
    const router = buildRpcRouter(services);

    await expect(
      call(router.races.upsert, {
        name: 'Orc',
        externalIds: [{ externalSystemId: 1, externalId: 'e1' }],
      }),
    ).rejects.toThrow('db unavailable');
  });

  it('rulesSets.upsert returns the flat entity with a created flag', async () => {
    const services = makeServices();
    (
      services.rulesSetsService.upsert as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      rulesSet: {
        id: 1,
        name: 'BB2020',
        createdAt: new Date('2026-01-01'),
      },
      created: true,
    });
    const router = buildRpcRouter(services);

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
    const services = makeServices();
    (
      services.rulesSetsService.upsert as ReturnType<typeof vi.fn>
    ).mockRejectedValue(
      new RulesSetUpsertConflictError(
        'External IDs matched multiple existing rules sets: 1, 2',
      ),
    );
    const router = buildRpcRouter(services);

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
    const services = makeServices();
    (
      services.rulesSetsService.upsert as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('db unavailable'));
    const router = buildRpcRouter(services);

    await expect(
      call(router.rulesSets.upsert, {
        name: 'BB2020',
        externalIds: [{ externalSystemId: 1, externalId: 'BB2020' }],
      }),
    ).rejects.toThrow('db unavailable');
  });

  it('eras.upsert returns the flat entity with a created flag', async () => {
    const services = makeServices();
    (services.erasService.upsert as ReturnType<typeof vi.fn>).mockResolvedValue(
      {
        era: {
          id: 1,
          name: 'BB2020',
          leagueId: 10,
          rulesSetIds: [20],
          startDate: '2021-09-01',
          endDate: '2023-06-10',
          createdAt: new Date('2026-01-01'),
        },
        created: true,
      },
    );
    const router = buildRpcRouter(services);

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
    const services = makeServices();
    (services.erasService.upsert as ReturnType<typeof vi.fn>).mockRejectedValue(
      new EraUpsertConflictError(
        'External IDs matched multiple existing eras: 1, 2',
      ),
    );
    const router = buildRpcRouter(services);

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
    const services = makeServices();
    (services.erasService.upsert as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('db unavailable'),
    );
    const router = buildRpcRouter(services);

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
    const services = makeServices();
    (
      services.positionsService.upsert as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      position: {
        id: 1,
        name: 'Lineman',
        isStarPlayer: false,
        createdAt: new Date('2026-01-01'),
      },
      created: true,
    });
    const router = buildRpcRouter(services);

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
    const services = makeServices();
    (
      services.positionsService.syncRaceEras as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      positionId: 1,
      raceEraIds: [10, 11],
    });
    const router = buildRpcRouter(services);

    const input = {
      positionId: 1,
      raceEras: [
        { raceId: 7, eraId: 1 },
        { raceId: 7, eraId: 2 },
      ],
    };
    const result = await call(router.positions.syncRaceEras, input);

    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(services.positionsService.syncRaceEras).toHaveBeenCalledWith(input);
    expect(result).toEqual({
      positionId: 1,
      raceEraIds: [10, 11],
    });
  });

  it('positions.upsert throws CONFLICT when the service reports a conflict', async () => {
    const services = makeServices();
    (
      services.positionsService.upsert as ReturnType<typeof vi.fn>
    ).mockRejectedValue(
      new PositionUpsertConflictError(
        'External IDs matched multiple existing positions: 1, 2',
      ),
    );
    const router = buildRpcRouter(services);

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
    const services = makeServices();
    (
      services.positionsService.upsert as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('db unavailable'));
    const router = buildRpcRouter(services);

    await expect(
      call(router.positions.upsert, {
        name: 'Lineman',
        isStarPlayer: false,
        externalIds: [{ externalSystemId: 1, externalId: '10-7' }],
      }),
    ).rejects.toThrow('db unavailable');
  });

  it('teams.upsert returns the flat entity with a created flag', async () => {
    const services = makeServices();
    (
      services.teamsService.upsert as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      team: {
        id: 1,
        name: '40 grinders',
        raceId: 5,
        coachId: 9,
        eras: [],
        createdAt: new Date('2026-01-01'),
      },
      created: true,
    });
    const router = buildRpcRouter(services);

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
    const services = makeServices();
    (
      services.teamsService.upsert as ReturnType<typeof vi.fn>
    ).mockRejectedValue(
      new TeamUpsertConflictError(
        'External IDs matched multiple existing teams: 1, 2',
      ),
    );
    const router = buildRpcRouter(services);

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
    const services = makeServices();
    (
      services.teamsService.upsert as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('db unavailable'));
    const router = buildRpcRouter(services);

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
    const services = makeServices();
    (
      services.competitionsService.upsert as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      competition: {
        id: 1,
        name: 'Major Season 24',
        type: 'season',
        eraId: 20,
        teamEraIds: [],
        createdAt: new Date('2026-01-01'),
      },
      created: true,
    });
    const router = buildRpcRouter(services);

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
    const services = makeServices();
    (
      services.competitionsService.upsert as ReturnType<typeof vi.fn>
    ).mockRejectedValue(
      new CompetitionUpsertConflictError(
        'External IDs matched multiple existing competitions: 1, 2',
      ),
    );
    const router = buildRpcRouter(services);

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
    const services = makeServices();
    (
      services.competitionsService.upsert as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('db unavailable'));
    const router = buildRpcRouter(services);

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
    const services = makeServices();
    (
      services.matchesService.upsert as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      match: {
        id: 1,
        competitionId: 20,
        teamEraIds: [100, 101],
        name: 'Final',
        playedAt: new Date('2021-09-25'),
        createdAt: new Date('2026-01-01'),
      },
      created: true,
    });
    const router = buildRpcRouter(services);

    const result = await call(router.matches.upsert, {
      competitionId: 20,
      playedAt: new Date('2021-09-25'),
      name: 'Final',
      externalIds: [{ externalSystemId: 1, externalId: '89' }],
    });

    expect(result).toEqual({
      id: 1,
      competitionId: 20,
      teamEraIds: [100, 101],
      name: 'Final',
      playedAt: new Date('2021-09-25'),
      createdAt: new Date('2026-01-01'),
      created: true,
    });
  });

  it('matches.upsert throws CONFLICT when the service reports a conflict', async () => {
    const services = makeServices();
    (
      services.matchesService.upsert as ReturnType<typeof vi.fn>
    ).mockRejectedValue(
      new MatchUpsertConflictError(
        'External IDs matched multiple existing matches: 1, 2',
      ),
    );
    const router = buildRpcRouter(services);

    await expect(
      call(router.matches.upsert, {
        competitionId: 20,
        playedAt: new Date('2021-09-25'),
        name: 'Final',
        externalIds: [{ externalSystemId: 1, externalId: '89' }],
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'External IDs matched multiple existing matches: 1, 2',
    });
  });

  it('matches.upsert rethrows errors that are not a conflict', async () => {
    const services = makeServices();
    (
      services.matchesService.upsert as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('db unavailable'));
    const router = buildRpcRouter(services);

    await expect(
      call(router.matches.upsert, {
        competitionId: 20,
        playedAt: new Date('2021-09-25'),
        name: 'Final',
        externalIds: [{ externalSystemId: 1, externalId: '89' }],
      }),
    ).rejects.toThrow('db unavailable');
  });

  it('players.upsert returns the flat entity with a created flag', async () => {
    const services = makeServices();
    const { playersService } = services;
    (playersService.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
      player: {
        id: 1,
        name: 'Griff Oberwald',
        teamEraId: 10,
        positionId: 20,
        createdAt: new Date('2026-01-01'),
      },
      created: true,
    });
    const router = buildRpcRouter(services);

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
    const services = makeServices();
    const { playersService } = services;
    (playersService.upsert as ReturnType<typeof vi.fn>).mockRejectedValue(
      new PlayerUpsertConflictError(
        'External IDs matched multiple existing players: 1, 2',
      ),
    );
    const router = buildRpcRouter(services);

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
    const services = makeServices();
    (
      services.matchEventsService.upsert as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      matchEvent: {
        id: 1,
        matchId: 10,
        actingMatchTeamId: 100,
        consequenceMatchTeamId: null,
        actingPlayerId: 9,
        consequencePlayerId: null,
        actionType: 'touchdown',
        consequenceType: null,
        createdAt: new Date('2026-01-01'),
      },
      created: true,
    });
    const router = buildRpcRouter(services);

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
    const services = makeServices();
    (
      services.matchEventsService.upsert as ReturnType<typeof vi.fn>
    ).mockRejectedValue(
      new MatchEventUpsertConflictError(
        'External IDs matched multiple existing match events: 1, 2',
      ),
    );
    const router = buildRpcRouter(services);

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
    const services = makeServices();
    (
      services.matchEventsService.upsert as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('db unavailable'));
    const router = buildRpcRouter(services);

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
});
