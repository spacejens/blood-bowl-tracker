import {
  CoachUpsertConflictError,
  MatchEventUpsertConflictError,
  MatchUpsertConflictError,
} from '@blood-bowl-tracker/game-data';
import { call } from '@orpc/server';
import { beforeEach, describe, expect, it } from 'vitest';

import { createRouterHarness } from './rpc-router-factory.test-helpers';

type Harness = Awaited<ReturnType<typeof createRouterHarness>>;

describe('RpcRouterFactoryService batch upserts', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await createRouterHarness();
  });

  const coachInput = (name: string) => ({
    name,
    externalIds: [{ externalSystemId: 1, externalId: `e-${name}` }],
  });

  const coachRow = (id: number, name: string) => ({
    id,
    name,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    historyVersion: 1,
    historyPeriod: '["2026-01-01 00:00:00+00",)',
  });

  it('coaches.upsertBatch returns one flat success entry per item', async () => {
    harness.mocks.coachesService.upsert
      .mockResolvedValueOnce({ coach: coachRow(1, 'Griff'), created: true })
      .mockResolvedValueOnce({ coach: coachRow(2, 'Morg'), created: false });

    const result = await call(harness.router.coaches.upsertBatch, [
      coachInput('Griff'),
      coachInput('Morg'),
    ]);

    expect(result).toEqual([
      {
        id: 1,
        name: 'Griff',
        createdAt: new Date('2026-01-01'),
        success: true,
        created: true,
      },
      {
        id: 2,
        name: 'Morg',
        createdAt: new Date('2026-01-01'),
        success: true,
        created: false,
      },
    ]);
    expect(harness.mocks.coachesService.upsert).toHaveBeenCalledTimes(2);
  });

  it('coaches.upsertBatch reports a conflicting item without failing its siblings', async () => {
    harness.mocks.coachesService.upsert
      .mockRejectedValueOnce(
        new CoachUpsertConflictError(
          'External IDs matched multiple existing coaches: 1, 2',
        ),
      )
      .mockResolvedValueOnce({ coach: coachRow(2, 'Morg'), created: true });

    const result = await call(harness.router.coaches.upsertBatch, [
      coachInput('Griff'),
      coachInput('Morg'),
    ]);

    expect(result).toEqual([
      {
        success: false,
        error: 'External IDs matched multiple existing coaches: 1, 2',
      },
      {
        id: 2,
        name: 'Morg',
        createdAt: new Date('2026-01-01'),
        success: true,
        created: true,
      },
    ]);
  });

  it('coaches.upsertBatch rethrows an error that is not a conflict', async () => {
    harness.mocks.coachesService.upsert.mockRejectedValue(
      new Error('db unavailable'),
    );

    await expect(
      call(harness.router.coaches.upsertBatch, [coachInput('Griff')]),
    ).rejects.toThrow('db unavailable');
  });

  it('externalSystems.upsertBatch returns flat success entries', async () => {
    harness.mocks.externalSystemsService.upsert.mockResolvedValue({
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

    const result = await call(harness.router.externalSystems.upsertBatch, [
      { name: 'BBL', category: 'imported_data_source' as const },
    ]);

    expect(result).toEqual([
      {
        id: 1,
        name: 'BBL',
        category: 'imported_data_source',
        createdAt: new Date('2026-01-01'),
        success: true,
        created: false,
      },
    ]);
  });

  it('leagues.upsertBatch returns one flat success entry per item', async () => {
    harness.mocks.leaguesService.upsert.mockResolvedValue({
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
    const input = {
      name: 'Test League',
      externalIds: [{ externalSystemId: 1, externalId: 'l1' }],
    };

    const result = await call(harness.router.leagues.upsertBatch, [input]);

    expect(harness.mocks.leaguesService.upsert).toHaveBeenCalledWith(input);
    expect(result).toEqual([
      {
        id: 1,
        name: 'Test League',
        createdAt: new Date('2026-01-01'),
        success: true,
        created: true,
      },
    ]);
  });

  it('races.upsertBatch returns one flat success entry per item', async () => {
    harness.mocks.racesService.upsert.mockResolvedValue({
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
    const input = {
      name: 'Orc',
      eras: [5],
      externalIds: [{ externalSystemId: 1, externalId: 'e1' }],
    };

    const result = await call(harness.router.races.upsertBatch, [input]);

    expect(harness.mocks.racesService.upsert).toHaveBeenCalledWith(input);
    expect(result).toEqual([
      {
        id: 1,
        name: 'Orc',
        eras: [5],
        createdAt: new Date('2026-01-01'),
        success: true,
        created: true,
      },
    ]);
  });

  it('players.upsertBatch returns one flat success entry per item', async () => {
    harness.mocks.playersService.upsert.mockResolvedValue({
      player: {
        id: 1,
        name: 'Griff Oberwald',
        teamEraId: 10,
        positionId: 20,
        sppTotal: null,
        sppAdjustment: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        historyVersion: 1,
        historyPeriod: '["2026-01-01 00:00:00+00",)',
      },
      created: true,
    });
    const input = {
      name: 'Griff Oberwald',
      teamEraId: 10,
      positionId: 20,
      externalIds: [{ externalSystemId: 1, externalId: '12345' }],
    };

    const result = await call(harness.router.players.upsertBatch, [input]);

    expect(harness.mocks.playersService.upsert).toHaveBeenCalledWith(input);
    expect(result).toEqual([
      {
        id: 1,
        name: 'Griff Oberwald',
        teamEraId: 10,
        positionId: 20,
        createdAt: new Date('2026-01-01'),
        success: true,
        created: true,
      },
    ]);
  });

  it('positions.upsertBatch returns one flat success entry per item', async () => {
    harness.mocks.positionsService.upsert.mockResolvedValue({
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
    const input = {
      name: 'Lineman',
      isStarPlayer: false,
      externalIds: [{ externalSystemId: 1, externalId: '10-7' }],
    };

    const result = await call(harness.router.positions.upsertBatch, [input]);

    expect(harness.mocks.positionsService.upsert).toHaveBeenCalledWith(input);
    expect(result).toEqual([
      {
        id: 1,
        name: 'Lineman',
        isStarPlayer: false,
        createdAt: new Date('2026-01-01'),
        success: true,
        created: true,
      },
    ]);
  });

  it('rulesSets.upsertBatch returns one flat success entry per item', async () => {
    harness.mocks.rulesSetsService.upsert.mockResolvedValue({
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
    const input = {
      name: 'BB2020',
      externalIds: [{ externalSystemId: 1, externalId: 'BB2020' }],
    };

    const result = await call(harness.router.rulesSets.upsertBatch, [input]);

    expect(harness.mocks.rulesSetsService.upsert).toHaveBeenCalledWith(input);
    expect(result).toEqual([
      {
        id: 1,
        name: 'BB2020',
        moveFormat: 'bare',
        strengthFormat: 'bare',
        agilityFormat: 'bare',
        passingFormat: 'plus',
        armourFormat: 'bare',
        createdAt: new Date('2026-01-01'),
        success: true,
        created: true,
      },
    ]);
  });

  it('eras.upsertBatch returns one flat success entry per item', async () => {
    harness.mocks.erasService.upsert.mockResolvedValue({
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
    const input = {
      name: 'BB2020',
      leagueId: 10,
      rulesSetIds: [20],
      startDate: '2021-09-01',
      endDate: '2023-06-10',
      externalIds: [{ externalSystemId: 1, externalId: 'BB2020' }],
    };

    const result = await call(harness.router.eras.upsertBatch, [input]);

    expect(harness.mocks.erasService.upsert).toHaveBeenCalledWith(input);
    expect(result).toEqual([
      {
        id: 1,
        name: 'BB2020',
        leagueId: 10,
        rulesSetIds: [20],
        startDate: '2021-09-01',
        endDate: '2023-06-10',
        createdAt: new Date('2026-01-01'),
        success: true,
        created: true,
      },
    ]);
  });

  it('competitions.upsertBatch returns one flat success entry per item', async () => {
    harness.mocks.competitionsService.upsert.mockResolvedValue({
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
    const input = {
      name: 'Major Season 24',
      type: 'season' as const,
      eraId: 20,
      externalIds: [{ externalSystemId: 1, externalId: '73' }],
    };

    const result = await call(harness.router.competitions.upsertBatch, [input]);

    expect(harness.mocks.competitionsService.upsert).toHaveBeenCalledWith({
      ...input,
      teamEraIds: [],
    });
    expect(result).toEqual([
      {
        id: 1,
        name: 'Major Season 24',
        type: 'season',
        eraId: 20,
        competitionGroupId: 5,
        teamEraIds: [],
        startDate: '2024-01-15',
        endDate: null,
        createdAt: new Date('2026-01-01'),
        success: true,
        created: true,
      },
    ]);
  });

  it('matches.upsertBatch returns one flat success entry per item', async () => {
    harness.mocks.matchesService.upsert.mockResolvedValue({
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
    const input = {
      competitionId: 20,
      playedAt: new Date('2021-09-25'),
      name: 'Final',
      category: 'season_final' as const,
      externalIds: [{ externalSystemId: 1, externalId: '89' }],
    };

    const result = await call(harness.router.matches.upsertBatch, [input]);

    expect(harness.mocks.matchesService.upsert).toHaveBeenCalledWith({
      ...input,
      teamEraIds: [],
    });
    expect(result).toEqual([
      {
        id: 1,
        competitionId: 20,
        teamEraIds: [100, 101],
        name: 'Final',
        category: 'season_final',
        playedAt: new Date('2021-09-25'),
        createdAt: new Date('2026-01-01'),
        success: true,
        created: true,
      },
    ]);
  });

  it('matchEvents.upsertBatch returns one flat success entry per item', async () => {
    harness.mocks.matchEventsService.upsert.mockResolvedValue({
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
    const input = {
      matchId: 10,
      actingTeamEraId: 100,
      actingPlayerId: 9,
      actionType: 'touchdown' as const,
      externalIds: [{ externalSystemId: 1, externalId: '1000-vor-td-0' }],
    };

    const result = await call(harness.router.matchEvents.upsertBatch, [input]);

    expect(harness.mocks.matchEventsService.upsert).toHaveBeenCalledWith(input);
    expect(result).toMatchObject([
      {
        id: 1,
        actionType: 'touchdown',
        success: true,
        created: true,
      },
    ]);
  });

  it('teams.upsertBatch returns one flat success entry per item', async () => {
    harness.mocks.teamsService.upsert.mockResolvedValue({
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
    const input = {
      name: '40 grinders',
      raceId: 5,
      coachId: 9,
      externalIds: [{ externalSystemId: 1, externalId: '40g' }],
    };

    const result = await call(harness.router.teams.upsertBatch, [input]);

    expect(harness.mocks.teamsService.upsert).toHaveBeenCalledWith({
      ...input,
      eras: [],
    });
    expect(result).toEqual([
      {
        id: 1,
        name: '40 grinders',
        raceId: 5,
        coachId: 9,
        eras: [],
        createdAt: new Date('2026-01-01'),
        success: true,
        created: true,
      },
    ]);
  });

  it('matchEvents.upsertBatch reports a conflicting item as a per-item failure', async () => {
    harness.mocks.matchEventsService.upsert.mockRejectedValue(
      new MatchEventUpsertConflictError(
        'External IDs matched multiple existing match events: 1, 2',
      ),
    );

    const result = await call(harness.router.matchEvents.upsertBatch, [
      {
        matchId: 10,
        actionType: 'touchdown' as const,
        externalIds: [{ externalSystemId: 1, externalId: 'ev-1' }],
      },
    ]);

    expect(result).toEqual([
      {
        success: false,
        error: 'External IDs matched multiple existing match events: 1, 2',
      },
    ]);
  });

  it('matches.upsertBatch reports a conflicting item as a per-item failure', async () => {
    harness.mocks.matchesService.upsert.mockRejectedValue(
      new MatchUpsertConflictError(
        'External IDs matched multiple existing matches: 1, 2',
      ),
    );

    const result = await call(harness.router.matches.upsertBatch, [
      {
        competitionId: 3,
        playedAt: new Date('2026-01-02'),
        name: 'Home vs Away',
        externalIds: [{ externalSystemId: 1, externalId: 'm-1' }],
      },
    ]);

    expect(result).toEqual([
      {
        success: false,
        error: 'External IDs matched multiple existing matches: 1, 2',
      },
    ]);
  });
});
