import type { UpsertCompetition } from '@blood-bowl-tracker/api-contract';
import type {
  CompetitionsImportService,
  MatchesImportService,
} from '@blood-bowl-tracker/import';
import type { TpMatch } from '@blood-bowl-tracker/parse-tp';
import { describe, expect, it, vi } from 'vitest';

import type { RosterEntry } from '../source/roster-collection.service';
import { TpTeamParticipationImportService } from './tp-team-participation-import.service';

function makeService(opts: {
  upsertCompetition: ReturnType<typeof vi.fn>;
  upsertMatch?: ReturnType<typeof vi.fn>;
}) {
  return new TpTeamParticipationImportService(
    {
      upsertCompetition: opts.upsertCompetition,
    } as unknown as CompetitionsImportService,
    {
      upsertMatch: opts.upsertMatch ?? vi.fn().mockResolvedValue(true),
    } as unknown as MatchesImportService,
  );
}

/** An UpsertCompetition as competitions import builds it (TP id 111, era 100). */
function competition(
  overrides: Partial<UpsertCompetition> = {},
): UpsertCompetition {
  return {
    name: 'Chaos Cup 8',
    type: 'cup',
    eraId: 100,
    teamEraIds: [],
    externalIds: [
      { externalSystemId: 1, externalId: '111' },
      { externalSystemId: 2, externalId: 'Chaos Cup 8' },
    ],
    ...overrides,
  };
}

/** A roster entry tagged with era/competition directory strings. */
function roster(era: string, comp: string, id: number): RosterEntry {
  return {
    era,
    competition: comp,
    roster: {
      id,
      teamName: `Team ${id}`,
      teamRaceCode: 'Orc',
      raceName: 'Orc',
      coachTpId: 'coach-1',
      positions: [],
    },
  };
}

function tpMatch(id: number, home: number, away: number): TpMatch {
  return {
    id,
    playedDate: new Date('2021-05-15T18:00:00Z'),
    name: 'Round 1',
    homeTeamTpId: home,
    awayTeamTpId: away,
  };
}

describe('TpTeamParticipationImportService', () => {
  it('re-upserts a competition with the team eras of its own directory rosters', async () => {
    const upsertCompetition = vi.fn().mockResolvedValue(true);
    const service = makeService({ upsertCompetition });

    const { result } = await service.importTeamParticipation({
      competitionsByTpId: new Map([
        [
          111,
          {
            upsert: competition(),
            era: 'Fourth era',
            competition: 'chaos-cup-8',
          },
        ],
      ]),
      competitionIdsByTpId: new Map([[111, 42]]),
      matchesByCompetitionId: new Map([[42, []]]),
      teamErasByRosterId: new Map([
        [1, [{ id: 700, eraId: 100 }]],
        [2, [{ id: 701, eraId: 100 }]],
      ]),
      rosters: [
        roster('Fourth era', 'chaos-cup-8', 1),
        roster('Fourth era', 'chaos-cup-8', 2),
        // A roster from a different competition directory — must be excluded.
        roster('Fourth era', 'other-cup', 3),
      ],
    });

    expect(result.imported).toBe(1);
    expect(upsertCompetition).toHaveBeenCalledWith(
      { ...competition(), teamEraIds: [700, 701] },
      expect.any(Array),
    );
  });

  it('resolves each competition against the era its own eraId names (multi-competition roster reuse)', async () => {
    const upsertCompetition = vi.fn().mockResolvedValue(true);
    const service = makeService({ upsertCompetition });

    const compA = competition({
      name: 'Comp A',
      eraId: 100,
      externalIds: [{ externalSystemId: 1, externalId: '111' }],
    });
    const compB = competition({
      name: 'Comp B',
      eraId: 200,
      externalIds: [{ externalSystemId: 1, externalId: '222' }],
    });

    await service.importTeamParticipation({
      competitionsByTpId: new Map([
        [111, { upsert: compA, era: 'Fourth era', competition: 'comp-a' }],
        [222, { upsert: compB, era: 'Fifth era', competition: 'comp-b' }],
      ]),
      competitionIdsByTpId: new Map([
        [111, 42],
        [222, 43],
      ]),
      matchesByCompetitionId: new Map([
        [42, []],
        [43, []],
      ]),
      // Team id 5 played both competitions, so has a team_eras row per era.
      teamErasByRosterId: new Map([
        [
          5,
          [
            { id: 500, eraId: 100 },
            { id: 501, eraId: 200 },
          ],
        ],
      ]),
      rosters: [
        roster('Fourth era', 'comp-a', 5),
        roster('Fifth era', 'comp-b', 5),
      ],
    });

    expect(upsertCompetition).toHaveBeenCalledWith(
      { ...compA, teamEraIds: [500] },
      expect.any(Array),
    );
    expect(upsertCompetition).toHaveBeenCalledWith(
      { ...compB, teamEraIds: [501] },
      expect.any(Array),
    );
  });

  it('re-upserts each match with both resolved team eras and a TP external id', async () => {
    const upsertMatch = vi.fn().mockResolvedValue(true);
    const service = makeService({
      upsertCompetition: vi.fn().mockResolvedValue(true),
      upsertMatch,
    });

    await service.importTeamParticipation({
      competitionsByTpId: new Map([
        [
          111,
          {
            upsert: competition(),
            era: 'Fourth era',
            competition: 'chaos-cup-8',
          },
        ],
      ]),
      competitionIdsByTpId: new Map([[111, 42]]),
      matchesByCompetitionId: new Map([[42, [tpMatch(500, 1, 2)]]]),
      teamErasByRosterId: new Map([
        [1, [{ id: 700, eraId: 100 }]],
        [2, [{ id: 701, eraId: 100 }]],
      ]),
      rosters: [
        roster('Fourth era', 'chaos-cup-8', 1),
        roster('Fourth era', 'chaos-cup-8', 2),
      ],
    });

    expect(upsertMatch).toHaveBeenCalledWith(
      {
        competitionId: 42,
        playedAt: new Date('2021-05-15T18:00:00Z'),
        name: 'Round 1',
        externalIds: [{ externalSystemId: 1, externalId: '500' }],
        teamEraIds: [700, 701],
      },
      expect.any(Array),
    );
  });

  it('records an error and skips a roster id it cannot resolve, still upserting the rest', async () => {
    const upsertCompetition = vi.fn().mockResolvedValue(true);
    const service = makeService({ upsertCompetition });

    const { result } = await service.importTeamParticipation({
      competitionsByTpId: new Map([
        [
          111,
          {
            upsert: competition(),
            era: 'Fourth era',
            competition: 'chaos-cup-8',
          },
        ],
      ]),
      competitionIdsByTpId: new Map([[111, 42]]),
      matchesByCompetitionId: new Map([[42, []]]),
      teamErasByRosterId: new Map([[1, [{ id: 700, eraId: 100 }]]]),
      rosters: [
        roster('Fourth era', 'chaos-cup-8', 1),
        roster('Fourth era', 'chaos-cup-8', 9), // no team_eras entry
      ],
    });

    expect(result.imported).toBe(1);
    expect(upsertCompetition).toHaveBeenCalledWith(
      { ...competition(), teamEraIds: [700] },
      expect.any(Array),
    );
    expect(result.success).toBe(false);
    expect(
      result.errors.some((e) => e.message.includes('could not resolve')),
    ).toBe(true);
  });

  it('records an error and skips a match when its home team era does not resolve', async () => {
    const upsertMatch = vi.fn().mockResolvedValue(true);
    const service = makeService({
      upsertCompetition: vi.fn().mockResolvedValue(true),
      upsertMatch,
    });

    const { result } = await service.importTeamParticipation({
      competitionsByTpId: new Map([
        [
          111,
          {
            upsert: competition(),
            era: 'Fourth era',
            competition: 'chaos-cup-8',
          },
        ],
      ]),
      competitionIdsByTpId: new Map([[111, 42]]),
      matchesByCompetitionId: new Map([[42, [tpMatch(500, 9, 2)]]]),
      teamErasByRosterId: new Map([[2, [{ id: 701, eraId: 100 }]]]),
      rosters: [roster('Fourth era', 'chaos-cup-8', 2)],
    });

    expect(upsertMatch).not.toHaveBeenCalled();
    expect(
      result.errors.some((e) =>
        e.message.includes('could not resolve both team eras'),
      ),
    ).toBe(true);
  });

  it('records an error and skips a match when its away team era does not resolve', async () => {
    const upsertMatch = vi.fn().mockResolvedValue(true);
    const service = makeService({
      upsertCompetition: vi.fn().mockResolvedValue(true),
      upsertMatch,
    });

    await service.importTeamParticipation({
      competitionsByTpId: new Map([
        [
          111,
          {
            upsert: competition(),
            era: 'Fourth era',
            competition: 'chaos-cup-8',
          },
        ],
      ]),
      competitionIdsByTpId: new Map([[111, 42]]),
      matchesByCompetitionId: new Map([[42, [tpMatch(500, 1, 9)]]]),
      teamErasByRosterId: new Map([[1, [{ id: 700, eraId: 100 }]]]),
      rosters: [roster('Fourth era', 'chaos-cup-8', 1)],
    });

    expect(upsertMatch).not.toHaveBeenCalled();
  });

  it('skips a competition with no matching rosters and no matches (no upsert)', async () => {
    const upsertCompetition = vi.fn();
    const upsertMatch = vi.fn();
    const service = makeService({ upsertCompetition, upsertMatch });

    const { result } = await service.importTeamParticipation({
      competitionsByTpId: new Map([
        [
          111,
          {
            upsert: competition(),
            era: 'Fourth era',
            competition: 'chaos-cup-8',
          },
        ],
      ]),
      competitionIdsByTpId: new Map([[111, 42]]),
      // No entry for competition 42 -> match resolution reads an empty list.
      matchesByCompetitionId: new Map(),
      teamErasByRosterId: new Map([[1, [{ id: 700, eraId: 100 }]]]),
      // Rosters exist, but under a different competition directory.
      rosters: [roster('Fourth era', 'other-cup', 1)],
    });

    expect(result.imported).toBe(0);
    expect(upsertCompetition).not.toHaveBeenCalled();
    expect(upsertMatch).not.toHaveBeenCalled();
  });

  it('records an error and skips match teams for a competition with no imported db id', async () => {
    const upsertMatch = vi.fn();
    const service = makeService({
      upsertCompetition: vi.fn().mockResolvedValue(true),
      upsertMatch,
    });

    const { result } = await service.importTeamParticipation({
      competitionsByTpId: new Map([
        [
          111,
          {
            upsert: competition(),
            era: 'Fourth era',
            competition: 'chaos-cup-8',
          },
        ],
      ]),
      // No competitionIdsByTpId entry for 111.
      competitionIdsByTpId: new Map(),
      matchesByCompetitionId: new Map([[42, [tpMatch(500, 1, 2)]]]),
      teamErasByRosterId: new Map([
        [1, [{ id: 700, eraId: 100 }]],
        [2, [{ id: 701, eraId: 100 }]],
      ]),
      rosters: [
        roster('Fourth era', 'chaos-cup-8', 1),
        roster('Fourth era', 'chaos-cup-8', 2),
      ],
    });

    expect(upsertMatch).not.toHaveBeenCalled();
    expect(
      result.errors.some((e) =>
        e.message.includes('no imported competition id'),
      ),
    ).toBe(true);
  });

  it('does not count a competition as imported when its re-upsert reports failure', async () => {
    const upsertCompetition = vi.fn().mockResolvedValue(false);
    const service = makeService({ upsertCompetition });

    const { result } = await service.importTeamParticipation({
      competitionsByTpId: new Map([
        [
          111,
          {
            upsert: competition(),
            era: 'Fourth era',
            competition: 'chaos-cup-8',
          },
        ],
      ]),
      competitionIdsByTpId: new Map([[111, 42]]),
      matchesByCompetitionId: new Map([[42, []]]),
      teamErasByRosterId: new Map([[1, [{ id: 700, eraId: 100 }]]]),
      rosters: [roster('Fourth era', 'chaos-cup-8', 1)],
    });

    expect(result.imported).toBe(0);
    expect(upsertCompetition).toHaveBeenCalledTimes(1);
  });
});
