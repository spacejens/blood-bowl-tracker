import {
  CoachesService,
  FACT_SCOPE_ALL_TIME,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { COACH_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import {
  COACH_TOPLIST_NO_DATA_MESSAGE,
  COACH_TOPLIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { DayCountFormatterService } from '../day-count-formatter.service';
import type { ResolveToplistOptions } from '../leaderboard.service';
import {
  LeaderboardService,
  TOPLIST_FETCH_LIMIT,
} from '../leaderboard.service';
import { CoachToplistService } from './coach-toplist.service';

interface MadeService {
  service: CoachToplistService;
  leaderboard: MockProxy<LeaderboardService>;
  dayCount: MockProxy<DayCountFormatterService>;
}

async function makeService(coaches: CoachesService): Promise<MadeService> {
  const leaderboard = mock<LeaderboardService>();
  const dayCount = mock<DayCountFormatterService>();
  const moduleRef = await Test.createTestingModule({
    providers: [
      CoachToplistService,
      { provide: CoachesService, useValue: coaches },
      { provide: LeaderboardService, useValue: leaderboard },
      { provide: DayCountFormatterService, useValue: dayCount },
    ],
  }).compile();
  return { service: moduleRef.get(CoachToplistService), leaderboard, dayCount };
}

interface CoachRow {
  coachId: number;
  name: string;
  count: number;
}

type CoachCountMethod =
  | 'countMatchesPlayedByCoach'
  | 'countMatchesWonByCoach'
  | 'countMatchesLostByCoach'
  | 'countMatchesDrawnByCoach'
  | 'countTeamsByCoach'
  | 'countCompetitionsByCoach'
  | 'countErasByCoach'
  | 'countFoulsCommittedByCoach'
  | 'getGapBetweenMatchesByCoachDescending'
  | 'getGapBetweenMatchesByCoachAscending'
  | 'getAverageGapBetweenMatchesByCoach';

interface ToplistCase {
  describeName: string;
  method: CoachCountMethod;
  resolve: (service: CoachToplistService) => Promise<unknown>;
  rows: CoachRow[];
  expectedTitle: string;
}

const cases: ToplistCase[] = [
  {
    describeName: 'resolveMatchesPlayed',
    method: 'countMatchesPlayedByCoach',
    resolve: (service) => service.resolveMatchesPlayed(FACT_SCOPE_ALL_TIME),
    rows: [
      { coachId: 1, name: 'Roze Madder', count: 9 },
      { coachId: 2, name: 'Grashnak', count: 9 },
      { coachId: 3, name: 'Skabsquik', count: 4 },
    ],
    expectedTitle: 'Coaches by matches played',
  },
  {
    describeName: 'resolveMatchesWon',
    method: 'countMatchesWonByCoach',
    resolve: (service) => service.resolveMatchesWon(FACT_SCOPE_ALL_TIME),
    rows: [
      { coachId: 1, name: 'Roze Madder', count: 6 },
      { coachId: 2, name: 'Grashnak', count: 6 },
      { coachId: 3, name: 'Skabsquik', count: 1 },
    ],
    expectedTitle: 'Coaches by matches won',
  },
  {
    describeName: 'resolveMatchesLost',
    method: 'countMatchesLostByCoach',
    resolve: (service) => service.resolveMatchesLost(FACT_SCOPE_ALL_TIME),
    rows: [
      { coachId: 3, name: 'Skabsquik', count: 8 },
      { coachId: 1, name: 'Roze Madder', count: 2 },
    ],
    expectedTitle: 'Coaches by matches lost',
  },
  {
    describeName: 'resolveMatchesDrawn',
    method: 'countMatchesDrawnByCoach',
    resolve: (service) => service.resolveMatchesDrawn(FACT_SCOPE_ALL_TIME),
    rows: [{ coachId: 2, name: 'Grashnak', count: 3 }],
    expectedTitle: 'Coaches by matches drawn',
  },
  {
    describeName: 'resolveTeams',
    method: 'countTeamsByCoach',
    resolve: (service) => service.resolveTeams(FACT_SCOPE_ALL_TIME),
    rows: [{ coachId: 1, name: 'Roze Madder', count: 3 }],
    expectedTitle: 'Coaches by teams coached',
  },
  {
    describeName: 'resolveCompetitionsPlayed',
    method: 'countCompetitionsByCoach',
    resolve: (service) =>
      service.resolveCompetitionsPlayed(FACT_SCOPE_ALL_TIME),
    rows: [
      { coachId: 1, name: 'Roze Madder', count: 5 },
      { coachId: 2, name: 'Grashnak', count: 2 },
    ],
    expectedTitle: 'Coaches by competitions played',
  },
  {
    describeName: 'resolveErasActive',
    method: 'countErasByCoach',
    resolve: (service) => service.resolveErasActive(),
    rows: [{ coachId: 1, name: 'Roze Madder', count: 3 }],
    expectedTitle: 'Coaches by eras active',
  },
  {
    describeName: 'resolveFoulsCommitted',
    method: 'countFoulsCommittedByCoach',
    resolve: (service) => service.resolveFoulsCommitted(FACT_SCOPE_ALL_TIME),
    rows: [
      { coachId: 1, name: 'Roze Madder', count: 13 },
      { coachId: 2, name: 'Grashnak', count: 4 },
    ],
    expectedTitle: 'Coaches by fouls committed',
  },
  {
    describeName: 'resolveTimeBetweenMatchesDescending',
    method: 'getGapBetweenMatchesByCoachDescending',
    resolve: (service) =>
      service.resolveTimeBetweenMatchesDescending(FACT_SCOPE_ALL_TIME),
    rows: [
      { coachId: 1, name: 'Roze Madder', count: 91 },
      { coachId: 2, name: 'Grashnak', count: 34 },
    ],
    expectedTitle: 'Coaches by longest time between matches (descending)',
  },
  {
    describeName: 'resolveTimeBetweenMatchesAscending',
    method: 'getGapBetweenMatchesByCoachAscending',
    resolve: (service) =>
      service.resolveTimeBetweenMatchesAscending(FACT_SCOPE_ALL_TIME),
    rows: [{ coachId: 3, name: 'Skabsquik', count: 6 }],
    expectedTitle: 'Coaches by longest time between matches (ascending)',
  },
  {
    describeName: 'resolveAverageTimeBetweenMatches',
    method: 'getAverageGapBetweenMatchesByCoach',
    resolve: (service) =>
      service.resolveAverageTimeBetweenMatches(FACT_SCOPE_ALL_TIME),
    rows: [
      { coachId: 2, name: 'Grashnak', count: 7 },
      { coachId: 1, name: 'Roze Madder', count: 30 },
    ],
    expectedTitle: 'Coaches by average time between matches',
  },
];

describe.each(cases)(
  'CoachToplistService.$describeName',
  ({ method, resolve, rows, expectedTitle }) => {
    // LeaderboardService.resolveToplist itself (ranking, ties, embed/button
    // rendering) is covered by leaderboard.service.spec.ts. Here `leaderboard`
    // is a mock returning a canned reply, so this test only asserts what
    // CoachToplistService itself owns: the embed title it configures, and the
    // per-row deepdive entityLink it configures.
    it('wires the embed title and per-row deepdive button id', async () => {
      const coaches = mock<CoachesService>();
      coaches[method].mockResolvedValue(rows);
      const { service, leaderboard } = await makeService(coaches);
      const canned = {
        embeds: [{ title: 'canned', description: 'canned' }],
      };
      leaderboard.resolveToplist.mockResolvedValueOnce(canned);
      const result = await resolve(service);
      expect(result).toBe(canned);
      const options = leaderboard.resolveToplist.mock
        .calls[0][0] as unknown as ResolveToplistOptions<CoachRow>;
      expect(options.title).toBe(expectedTitle);
      expect(options.entityLink?.customIdPrefix).toBe(
        COACH_BUTTON_CUSTOM_ID_PREFIX,
      );
      expect(options.entityLink?.entityId(rows[0])).toBe(rows[0].coachId);
    });

    it('binds fetchRows to a call passing the fetch limit', async () => {
      const coaches = mock<CoachesService>();
      const queryFn = coaches[method];
      queryFn.mockResolvedValue(rows);
      const { service, leaderboard } = await makeService(coaches);
      leaderboard.resolveToplist.mockImplementation(async (options) => {
        await options.fetchRows(TOPLIST_FETCH_LIMIT);
        return 'canned';
      });
      await resolve(service);
      expect(queryFn.mock.calls[0]?.at(-1)).toBe(TOPLIST_FETCH_LIMIT);
    });

    // The real timeout race lives in DatabaseTimeoutService/LeaderboardService
    // (covered by their own specs); here `leaderboard` is a mock, so this
    // confirms CoachToplistService configures the right timeout message and
    // that whatever leaderboard.resolveToplist resolves to is returned as-is.
    it('configures the toplist-specific timeout message and returns it verbatim on timeout', async () => {
      const coaches = mock<CoachesService>();
      coaches[method].mockResolvedValue(rows);
      const { service, leaderboard } = await makeService(coaches);
      leaderboard.resolveToplist.mockResolvedValueOnce(
        COACH_TOPLIST_TIMEOUT_MESSAGE,
      );
      const result = await resolve(service);
      expect(result).toBe(COACH_TOPLIST_TIMEOUT_MESSAGE);
      expect(leaderboard.resolveToplist).toHaveBeenCalledWith(
        expect.objectContaining({
          timeoutMessage: COACH_TOPLIST_TIMEOUT_MESSAGE,
        }),
      );
    });
  },
);

describe('CoachToplistService.resolveCompetitionsPlayed', () => {
  it('passes the era id through to the query', async () => {
    const coaches = mock<CoachesService>();
    coaches.countCompetitionsByCoach.mockResolvedValue([
      { coachId: 1, name: 'Roze Madder', count: 3 },
    ]);
    const { service, leaderboard } = await makeService(coaches);
    leaderboard.resolveToplist.mockImplementation(async (options) => {
      await options.fetchRows(TOPLIST_FETCH_LIMIT);
      return 'canned';
    });
    await service.resolveCompetitionsPlayed({ eraId: 20 });
    expect(coaches.countCompetitionsByCoach).toHaveBeenCalledWith(
      { eraId: 20 },
      TOPLIST_FETCH_LIMIT,
    );
  });
});

describe('CoachToplistService.resolveErasActive', () => {
  it('passes the fetch limit through to the query', async () => {
    const coaches = mock<CoachesService>();
    coaches.countErasByCoach.mockResolvedValue([]);
    const { service, leaderboard } = await makeService(coaches);
    leaderboard.resolveToplist.mockImplementation(async (options) => {
      await options.fetchRows(TOPLIST_FETCH_LIMIT);
      return 'canned';
    });
    await service.resolveErasActive();
    expect(coaches.countErasByCoach).toHaveBeenCalledWith(TOPLIST_FETCH_LIMIT);
  });
});

describe('CoachToplistService.resolveFoulsCommitted', () => {
  it('passes the whole scope and the fetch limit through to the query', async () => {
    // The competitionId is forwarded verbatim here on purpose: dropping it is
    // CoachesService.countFoulsCommittedByCoach's responsibility, covered in
    // its own spec.
    const coaches = mock<CoachesService>();
    coaches.countFoulsCommittedByCoach.mockResolvedValue([
      { coachId: 1, name: 'Roze Madder', count: 13 },
    ]);
    const { service, leaderboard } = await makeService(coaches);
    leaderboard.resolveToplist.mockImplementation(async (options) => {
      await options.fetchRows(TOPLIST_FETCH_LIMIT);
      return 'canned';
    });
    await service.resolveFoulsCommitted({ leagueId: 9, eraId: 20 });
    expect(coaches.countFoulsCommittedByCoach).toHaveBeenCalledWith(
      { leagueId: 9, eraId: 20 },
      TOPLIST_FETCH_LIMIT,
    );
  });
});

describe('CoachToplistService time-between-matches rendering', () => {
  it('renders each row through the day-count formatter', async () => {
    const coaches = mock<CoachesService>();
    coaches.getGapBetweenMatchesByCoachDescending.mockResolvedValue([]);
    const { service, leaderboard, dayCount } = await makeService(coaches);
    dayCount.format.mockReturnValue('91 days');
    leaderboard.resolveToplist.mockResolvedValueOnce('canned');
    await service.resolveTimeBetweenMatchesDescending(FACT_SCOPE_ALL_TIME);
    const options = leaderboard.resolveToplist.mock
      .calls[0][0] as unknown as ResolveToplistOptions<CoachRow>;
    expect(
      options.formatRow?.({
        coachId: 1,
        name: 'Roze Madder',
        count: 91,
        rank: 1,
      }),
    ).toBe('1. Roze Madder — 91 days');
    expect(dayCount.format).toHaveBeenCalledWith(91);
  });

  it('renders the average toplist rows through the same formatter', async () => {
    const coaches = mock<CoachesService>();
    coaches.getAverageGapBetweenMatchesByCoach.mockResolvedValue([]);
    const { service, leaderboard, dayCount } = await makeService(coaches);
    dayCount.format.mockReturnValue('1 day');
    leaderboard.resolveToplist.mockResolvedValueOnce('canned');
    await service.resolveAverageTimeBetweenMatches(FACT_SCOPE_ALL_TIME);
    const options = leaderboard.resolveToplist.mock
      .calls[0][0] as unknown as ResolveToplistOptions<CoachRow>;
    expect(
      options.formatRow?.({
        coachId: 3,
        name: 'Skabsquik',
        count: 1,
        rank: 2,
      }),
    ).toBe('2. Skabsquik — 1 day');
  });

  it('passes the league and era scope through to the ascending-gap query', async () => {
    const coaches = mock<CoachesService>();
    coaches.getGapBetweenMatchesByCoachAscending.mockResolvedValue([]);
    const { service, leaderboard } = await makeService(coaches);
    leaderboard.resolveToplist.mockImplementation(async (options) => {
      await options.fetchRows(TOPLIST_FETCH_LIMIT);
      return 'canned';
    });
    await service.resolveTimeBetweenMatchesAscending({
      leagueId: 9,
      eraId: 20,
    });
    expect(coaches.getGapBetweenMatchesByCoachAscending).toHaveBeenCalledWith(
      { leagueId: 9, eraId: 20 },
      TOPLIST_FETCH_LIMIT,
    );
  });

  it('uses the shared coach no-data message for an empty toplist', async () => {
    const coaches = mock<CoachesService>();
    coaches.getAverageGapBetweenMatchesByCoach.mockResolvedValue([]);
    const { service, leaderboard } = await makeService(coaches);
    leaderboard.resolveToplist.mockResolvedValueOnce('canned');
    await service.resolveAverageTimeBetweenMatches(FACT_SCOPE_ALL_TIME);
    expect(leaderboard.resolveToplist).toHaveBeenCalledWith(
      expect.objectContaining({
        noDataMessage: COACH_TOPLIST_NO_DATA_MESSAGE,
      }),
    );
  });
});
