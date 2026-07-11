import type {
  CoachesService,
  CompetitionsService,
  ErasService,
  ExternalSystemsService,
  LeaguesService,
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
    positionsService: { upsert: vi.fn() } as unknown as PositionsService,
    teamsService: { upsert: vi.fn() } as unknown as TeamsService,
    competitionsService: {
      upsert: vi.fn(),
    } as unknown as CompetitionsService,
  };
}

describe('buildRpcRouter', () => {
  it('coaches.upsert returns the flat entity with a created flag', async () => {
    const {
      coachesService,
      externalSystemsService,
      leaguesService,
      racesService,
      rulesSetsService,
      erasService,
      positionsService,
      teamsService,
      competitionsService,
    } = makeServices();
    (coachesService.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
      coach: { id: 1, name: 'Roze Madder', createdAt: new Date('2026-01-01') },
      created: true,
    });
    const router = buildRpcRouter(
      coachesService,
      externalSystemsService,
      leaguesService,
      racesService,
      rulesSetsService,
      erasService,
      positionsService,
      teamsService,
      competitionsService,
    );

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
    const {
      coachesService,
      externalSystemsService,
      leaguesService,
      racesService,
      rulesSetsService,
      erasService,
      positionsService,
      teamsService,
      competitionsService,
    } = makeServices();
    (coachesService.upsert as ReturnType<typeof vi.fn>).mockRejectedValue(
      new CoachUpsertConflictError(
        'External IDs matched multiple existing coaches: 1, 2',
      ),
    );
    const router = buildRpcRouter(
      coachesService,
      externalSystemsService,
      leaguesService,
      racesService,
      rulesSetsService,
      erasService,
      positionsService,
      teamsService,
      competitionsService,
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
    const {
      coachesService,
      externalSystemsService,
      leaguesService,
      racesService,
      rulesSetsService,
      erasService,
      positionsService,
      teamsService,
      competitionsService,
    } = makeServices();
    (coachesService.upsert as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('db unavailable'),
    );
    const router = buildRpcRouter(
      coachesService,
      externalSystemsService,
      leaguesService,
      racesService,
      rulesSetsService,
      erasService,
      positionsService,
      teamsService,
      competitionsService,
    );

    await expect(
      call(router.coaches.upsert, {
        name: 'Roze Madder',
        externalIds: [{ externalSystemId: 1, externalId: 'e1' }],
      }),
    ).rejects.toThrow('db unavailable');
  });

  it('externalSystems.upsert returns the flat entity with a created flag', async () => {
    const {
      coachesService,
      externalSystemsService,
      leaguesService,
      racesService,
      rulesSetsService,
      erasService,
      positionsService,
      teamsService,
      competitionsService,
    } = makeServices();
    (
      externalSystemsService.upsert as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      system: { id: 1, name: 'BBL', createdAt: new Date('2026-01-01') },
      created: false,
    });
    const router = buildRpcRouter(
      coachesService,
      externalSystemsService,
      leaguesService,
      racesService,
      rulesSetsService,
      erasService,
      positionsService,
      teamsService,
      competitionsService,
    );

    const result = await call(router.externalSystems.upsert, { name: 'BBL' });

    expect(result).toEqual({
      id: 1,
      name: 'BBL',
      createdAt: new Date('2026-01-01'),
      created: false,
    });
  });

  it('leagues.upsert returns the flat entity with a created flag', async () => {
    const {
      coachesService,
      externalSystemsService,
      leaguesService,
      racesService,
      rulesSetsService,
      erasService,
      positionsService,
      teamsService,
      competitionsService,
    } = makeServices();
    (leaguesService.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
      league: {
        id: 1,
        name: 'Test League',
        createdAt: new Date('2026-01-01'),
      },
      created: true,
    });
    const router = buildRpcRouter(
      coachesService,
      externalSystemsService,
      leaguesService,
      racesService,
      rulesSetsService,
      erasService,
      positionsService,
      teamsService,
      competitionsService,
    );

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
    const {
      coachesService,
      externalSystemsService,
      leaguesService,
      racesService,
      rulesSetsService,
      erasService,
      positionsService,
      teamsService,
      competitionsService,
    } = makeServices();
    (leaguesService.upsert as ReturnType<typeof vi.fn>).mockRejectedValue(
      new LeagueUpsertConflictError(
        'External IDs matched multiple existing leagues: 1, 2',
      ),
    );
    const router = buildRpcRouter(
      coachesService,
      externalSystemsService,
      leaguesService,
      racesService,
      rulesSetsService,
      erasService,
      positionsService,
      teamsService,
      competitionsService,
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
    const {
      coachesService,
      externalSystemsService,
      leaguesService,
      racesService,
      rulesSetsService,
      erasService,
      positionsService,
      teamsService,
      competitionsService,
    } = makeServices();
    (leaguesService.upsert as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('db unavailable'),
    );
    const router = buildRpcRouter(
      coachesService,
      externalSystemsService,
      leaguesService,
      racesService,
      rulesSetsService,
      erasService,
      positionsService,
      teamsService,
      competitionsService,
    );

    await expect(
      call(router.leagues.upsert, {
        name: 'Test League',
        externalIds: [{ externalSystemId: 1, externalId: 'e1' }],
      }),
    ).rejects.toThrow('db unavailable');
  });

  it('races.upsert returns the flat entity with a created flag', async () => {
    const {
      coachesService,
      externalSystemsService,
      leaguesService,
      racesService,
      rulesSetsService,
      erasService,
      positionsService,
      teamsService,
      competitionsService,
    } = makeServices();
    (racesService.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({
      race: { id: 1, name: 'Orc', createdAt: new Date('2026-01-01') },
      created: true,
    });
    const router = buildRpcRouter(
      coachesService,
      externalSystemsService,
      leaguesService,
      racesService,
      rulesSetsService,
      erasService,
      positionsService,
      teamsService,
      competitionsService,
    );

    const result = await call(router.races.upsert, {
      name: 'Orc',
      externalIds: [{ externalSystemId: 1, externalId: 'e1' }],
    });

    expect(result).toEqual({
      id: 1,
      name: 'Orc',
      createdAt: new Date('2026-01-01'),
      created: true,
    });
  });

  it('races.upsert throws CONFLICT when the service reports a conflict', async () => {
    const {
      coachesService,
      externalSystemsService,
      leaguesService,
      racesService,
      rulesSetsService,
      erasService,
      positionsService,
      teamsService,
      competitionsService,
    } = makeServices();
    (racesService.upsert as ReturnType<typeof vi.fn>).mockRejectedValue(
      new RaceUpsertConflictError(
        'External IDs matched multiple existing races: 1, 2',
      ),
    );
    const router = buildRpcRouter(
      coachesService,
      externalSystemsService,
      leaguesService,
      racesService,
      rulesSetsService,
      erasService,
      positionsService,
      teamsService,
      competitionsService,
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
    const {
      coachesService,
      externalSystemsService,
      leaguesService,
      racesService,
      rulesSetsService,
      erasService,
      positionsService,
      teamsService,
      competitionsService,
    } = makeServices();
    (racesService.upsert as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('db unavailable'),
    );
    const router = buildRpcRouter(
      coachesService,
      externalSystemsService,
      leaguesService,
      racesService,
      rulesSetsService,
      erasService,
      positionsService,
      teamsService,
      competitionsService,
    );

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
      rulesSet: { id: 1, name: 'BB2020', createdAt: new Date('2026-01-01') },
      created: true,
    });
    const router = buildRpcRouter(
      services.coachesService,
      services.externalSystemsService,
      services.leaguesService,
      services.racesService,
      services.rulesSetsService,
      services.erasService,
      services.positionsService,
      services.teamsService,
      services.competitionsService,
    );

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
    const router = buildRpcRouter(
      services.coachesService,
      services.externalSystemsService,
      services.leaguesService,
      services.racesService,
      services.rulesSetsService,
      services.erasService,
      services.positionsService,
      services.teamsService,
      services.competitionsService,
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
    const services = makeServices();
    (
      services.rulesSetsService.upsert as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('db unavailable'));
    const router = buildRpcRouter(
      services.coachesService,
      services.externalSystemsService,
      services.leaguesService,
      services.racesService,
      services.rulesSetsService,
      services.erasService,
      services.positionsService,
      services.teamsService,
      services.competitionsService,
    );

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
          rulesSetId: 20,
          startDate: '2021-09-01',
          endDate: '2023-06-10',
          createdAt: new Date('2026-01-01'),
        },
        created: true,
      },
    );
    const router = buildRpcRouter(
      services.coachesService,
      services.externalSystemsService,
      services.leaguesService,
      services.racesService,
      services.rulesSetsService,
      services.erasService,
      services.positionsService,
      services.teamsService,
      services.competitionsService,
    );

    const result = await call(router.eras.upsert, {
      name: 'BB2020',
      leagueId: 10,
      rulesSetId: 20,
      startDate: '2021-09-01',
      endDate: '2023-06-10',
      externalIds: [{ externalSystemId: 1, externalId: 'BB2020' }],
    });

    expect(result).toEqual({
      id: 1,
      name: 'BB2020',
      leagueId: 10,
      rulesSetId: 20,
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
    const router = buildRpcRouter(
      services.coachesService,
      services.externalSystemsService,
      services.leaguesService,
      services.racesService,
      services.rulesSetsService,
      services.erasService,
      services.positionsService,
      services.teamsService,
      services.competitionsService,
    );

    await expect(
      call(router.eras.upsert, {
        name: 'BB2020',
        leagueId: 10,
        rulesSetId: 20,
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
    const router = buildRpcRouter(
      services.coachesService,
      services.externalSystemsService,
      services.leaguesService,
      services.racesService,
      services.rulesSetsService,
      services.erasService,
      services.positionsService,
      services.teamsService,
      services.competitionsService,
    );

    await expect(
      call(router.eras.upsert, {
        name: 'BB2020',
        leagueId: 10,
        rulesSetId: 20,
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
        races: [{ raceId: 7, isDeleted: false }],
        createdAt: new Date('2026-01-01'),
      },
      created: true,
    });
    const router = buildRpcRouter(
      services.coachesService,
      services.externalSystemsService,
      services.leaguesService,
      services.racesService,
      services.rulesSetsService,
      services.erasService,
      services.positionsService,
      services.teamsService,
      services.competitionsService,
    );

    const result = await call(router.positions.upsert, {
      name: 'Lineman',
      isStarPlayer: false,
      races: [{ raceId: 7, isDeleted: false }],
      externalIds: [{ externalSystemId: 1, externalId: '10-7' }],
    });

    expect(result).toEqual({
      id: 1,
      name: 'Lineman',
      isStarPlayer: false,
      races: [{ raceId: 7, isDeleted: false }],
      createdAt: new Date('2026-01-01'),
      created: true,
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
    const router = buildRpcRouter(
      services.coachesService,
      services.externalSystemsService,
      services.leaguesService,
      services.racesService,
      services.rulesSetsService,
      services.erasService,
      services.positionsService,
      services.teamsService,
      services.competitionsService,
    );

    await expect(
      call(router.positions.upsert, {
        name: 'Lineman',
        isStarPlayer: false,
        races: [{ raceId: 7, isDeleted: false }],
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
    const router = buildRpcRouter(
      services.coachesService,
      services.externalSystemsService,
      services.leaguesService,
      services.racesService,
      services.rulesSetsService,
      services.erasService,
      services.positionsService,
      services.teamsService,
      services.competitionsService,
    );

    await expect(
      call(router.positions.upsert, {
        name: 'Lineman',
        isStarPlayer: false,
        races: [{ raceId: 7, isDeleted: false }],
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
        createdAt: new Date('2026-01-01'),
      },
      created: true,
    });
    const router = buildRpcRouter(
      services.coachesService,
      services.externalSystemsService,
      services.leaguesService,
      services.racesService,
      services.rulesSetsService,
      services.erasService,
      services.positionsService,
      services.teamsService,
      services.competitionsService,
    );

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
    const router = buildRpcRouter(
      services.coachesService,
      services.externalSystemsService,
      services.leaguesService,
      services.racesService,
      services.rulesSetsService,
      services.erasService,
      services.positionsService,
      services.teamsService,
      services.competitionsService,
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
    const services = makeServices();
    (
      services.teamsService.upsert as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('db unavailable'));
    const router = buildRpcRouter(
      services.coachesService,
      services.externalSystemsService,
      services.leaguesService,
      services.racesService,
      services.rulesSetsService,
      services.erasService,
      services.positionsService,
      services.teamsService,
      services.competitionsService,
    );

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
        createdAt: new Date('2026-01-01'),
      },
      created: true,
    });
    const router = buildRpcRouter(
      services.coachesService,
      services.externalSystemsService,
      services.leaguesService,
      services.racesService,
      services.rulesSetsService,
      services.erasService,
      services.positionsService,
      services.teamsService,
      services.competitionsService,
    );

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
    const router = buildRpcRouter(
      services.coachesService,
      services.externalSystemsService,
      services.leaguesService,
      services.racesService,
      services.rulesSetsService,
      services.erasService,
      services.positionsService,
      services.teamsService,
      services.competitionsService,
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
    const services = makeServices();
    (
      services.competitionsService.upsert as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('db unavailable'));
    const router = buildRpcRouter(
      services.coachesService,
      services.externalSystemsService,
      services.leaguesService,
      services.racesService,
      services.rulesSetsService,
      services.erasService,
      services.positionsService,
      services.teamsService,
      services.competitionsService,
    );

    await expect(
      call(router.competitions.upsert, {
        name: 'Major Season 24',
        type: 'season',
        eraId: 20,
        externalIds: [{ externalSystemId: 1, externalId: '73' }],
      }),
    ).rejects.toThrow('db unavailable');
  });
});
