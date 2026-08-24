import type { FactScope } from '@blood-bowl-tracker/game-data';
import {
  FACT_SCOPE_ALL_TIME,
  TeamsService,
} from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TEAM_BUTTON_CUSTOM_ID_PREFIX } from '../../deepdive/button-custom-ids';
import { TEAM_TOPLIST_TIMEOUT_MESSAGE } from '../../error-messages';
import type { ResolveToplistOptions } from '../leaderboard.service';
import {
  LeaderboardService,
  TOPLIST_FETCH_LIMIT,
} from '../leaderboard.service';
import { TeamContextService } from '../team-context.service';
import { TeamToplistService } from './team-toplist.service';
import { ToplistFactoryService } from './toplist-factory.service';
import type { ToplistFactoryMock } from './toplist-factory-mock.test-helpers';
import { mockToplistFactory } from './toplist-factory-mock.test-helpers';

type TeamRow = {
  teamId: number;
  name: string;
  count: number;
  contextSuffix?: string;
};

/** The 14 team toplists the factory builds. */
type TeamFactoryMethod =
  | 'countTouchdownsScoredByTeam'
  | 'countCompletionsByTeam'
  | 'countInterceptionsByTeam'
  | 'countDeflectionsByTeam'
  | 'countCasualtiesCausedByTeam'
  | 'countSeriousInjuriesCausedByTeam'
  | 'countDeathsCausedByTeam'
  | 'countFoulsCommittedByTeam'
  | 'countTimesSentOffByTeam'
  | 'countCasualtiesSufferedByTeam'
  | 'countSeriousInjuriesSufferedByTeam'
  | 'countLastingInjuriesSufferedByTeam'
  | 'countDeathsSufferedByTeam'
  | 'countTrophiesByTeam';

/** The six team toplists TeamToplistService still writes by hand. */
type TeamHandWrittenMethod =
  | 'countMatchesPlayedByTeam'
  | 'countMatchesWonByTeam'
  | 'countMatchesLostByTeam'
  | 'countMatchesDrawnByTeam'
  | 'countCompetitionsByTeam'
  | 'countErasByTeam';

interface MadeService {
  service: TeamToplistService;
  leaderboard: MockProxy<LeaderboardService>;
  teamContext: MockProxy<TeamContextService>;
  toplist: ToplistFactoryMock<TeamFactoryMethod, TeamRow>;
}

async function makeService(
  teams: TeamsService,
  teamContext: MockProxy<TeamContextService> = mock<TeamContextService>(),
): Promise<MadeService> {
  const leaderboard = mock<LeaderboardService>();
  const toplist = mockToplistFactory<TeamFactoryMethod, TeamRow>();
  const moduleRef = await Test.createTestingModule({
    providers: [
      TeamToplistService,
      { provide: TeamsService, useValue: teams },
      { provide: LeaderboardService, useValue: leaderboard },
      { provide: TeamContextService, useValue: teamContext },
      { provide: ToplistFactoryService, useValue: toplist.factory },
    ],
  }).compile();
  return {
    service: moduleRef.get(TeamToplistService),
    leaderboard,
    teamContext,
    toplist,
  };
}

interface FactoryCase {
  describeName: string;
  method: TeamFactoryMethod;
  resolve: (service: TeamToplistService, scope?: FactScope) => Promise<unknown>;
  rows: TeamRow[];
  eraRows?: TeamRow[];
  competitionRows?: TeamRow[];
  expectedTitle: string;
}

interface HandWrittenCase {
  describeName: string;
  method: TeamHandWrittenMethod;
  resolve: (service: TeamToplistService, scope?: FactScope) => Promise<unknown>;
  rows: TeamRow[];
  eraRows?: TeamRow[];
  competitionRows?: TeamRow[];
  expectedTitle: string;
}

const factoryCases: FactoryCase[] = [
  {
    describeName: 'resolveTouchdownsScored',
    method: 'countTouchdownsScoredByTeam',
    resolve: (service, scope) =>
      service.resolveTouchdownsScored(scope as FactScope),
    rows: [
      { teamId: 1, name: '40 grinders', count: 15 },
      { teamId: 2, name: 'Gouged Eye', count: 15 },
      { teamId: 3, name: 'Reikland Reavers', count: 6 },
    ],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 3 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    expectedTitle: 'Teams by touchdowns scored',
  },
  {
    describeName: 'resolveCompletions',
    method: 'countCompletionsByTeam',
    resolve: (service, scope) => service.resolveCompletions(scope as FactScope),
    rows: [{ teamId: 1, name: '40 grinders', count: 8 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
    expectedTitle: 'Teams by completions',
  },
  {
    describeName: 'resolveInterceptions',
    method: 'countInterceptionsByTeam',
    resolve: (service, scope) =>
      service.resolveInterceptions(scope as FactScope),
    rows: [{ teamId: 1, name: '40 grinders', count: 5 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
    expectedTitle: 'Teams by interceptions',
  },
  {
    describeName: 'resolveDeflections',
    method: 'countDeflectionsByTeam',
    resolve: (service, scope) => service.resolveDeflections(scope as FactScope),
    rows: [{ teamId: 1, name: '40 grinders', count: 4 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
    expectedTitle: 'Teams by deflections',
  },
  {
    describeName: 'resolveCasualtiesCaused',
    method: 'countCasualtiesCausedByTeam',
    resolve: (service, scope) =>
      service.resolveCasualtiesCaused(scope as FactScope),
    rows: [
      { teamId: 1, name: '40 grinders', count: 22 },
      { teamId: 2, name: 'Gouged Eye', count: 22 },
      { teamId: 3, name: 'Reikland Reavers', count: 9 },
    ],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 3 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    expectedTitle: 'Teams by casualties inflicted',
  },
  {
    describeName: 'resolveSeriousInjuriesCaused',
    method: 'countSeriousInjuriesCausedByTeam',
    resolve: (service, scope) =>
      service.resolveSeriousInjuriesCaused(scope as FactScope),
    rows: [{ teamId: 1, name: '40 grinders', count: 7 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
    expectedTitle: 'Teams by serious injuries inflicted',
  },
  {
    describeName: 'resolveDeathsCaused',
    method: 'countDeathsCausedByTeam',
    resolve: (service, scope) =>
      service.resolveDeathsCaused(scope as FactScope),
    rows: [{ teamId: 1, name: '40 grinders', count: 4 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
    expectedTitle: 'Teams by opponents killed',
  },
  {
    describeName: 'resolveFoulsCommitted',
    method: 'countFoulsCommittedByTeam',
    resolve: (service, scope) =>
      service.resolveFoulsCommitted(scope as FactScope),
    rows: [{ teamId: 1, name: '40 grinders', count: 13 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
    expectedTitle: 'Teams by fouls committed',
  },
  {
    describeName: 'resolveTimesSentOff',
    method: 'countTimesSentOffByTeam',
    resolve: (service, scope) =>
      service.resolveTimesSentOff(scope as FactScope),
    rows: [{ teamId: 1, name: '40 grinders', count: 8 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
    expectedTitle: 'Teams by times sent off',
  },
  {
    describeName: 'resolveCasualtiesSuffered',
    method: 'countCasualtiesSufferedByTeam',
    resolve: (service, scope) =>
      service.resolveCasualtiesSuffered(scope as FactScope),
    rows: [
      { teamId: 1, name: '40 grinders', count: 18 },
      { teamId: 2, name: 'Gouged Eye', count: 18 },
      { teamId: 3, name: 'Chaos All-Stars', count: 5 },
    ],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 3 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    expectedTitle: 'Teams by casualties suffered',
  },
  {
    describeName: 'resolveSeriousInjuriesSuffered',
    method: 'countSeriousInjuriesSufferedByTeam',
    resolve: (service, scope) =>
      service.resolveSeriousInjuriesSuffered(scope as FactScope),
    rows: [{ teamId: 1, name: '40 grinders', count: 6 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
    expectedTitle: 'Teams by serious injuries suffered',
  },
  {
    describeName: 'resolveLastingInjuriesSuffered',
    method: 'countLastingInjuriesSufferedByTeam',
    resolve: (service, scope) =>
      service.resolveLastingInjuriesSuffered(scope as FactScope),
    rows: [{ teamId: 1, name: '40 grinders', count: 4 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
    expectedTitle: 'Teams by lasting injuries suffered',
  },
  {
    describeName: 'resolveDeathsSuffered',
    method: 'countDeathsSufferedByTeam',
    resolve: (service, scope) =>
      service.resolveDeathsSuffered(scope as FactScope),
    rows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
    expectedTitle: 'Teams by deaths suffered',
  },
  {
    describeName: 'resolveTrophiesWon',
    method: 'countTrophiesByTeam',
    resolve: (service, scope) => service.resolveTrophiesWon(scope as FactScope),
    rows: [
      { teamId: 1, name: '40 grinders', count: 5 },
      { teamId: 2, name: 'Reikland Reavers', count: 2 },
    ],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 3 }],
    competitionRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
    expectedTitle: 'Teams by trophies won',
  },
];

const handWrittenCases: HandWrittenCase[] = [
  {
    describeName: 'resolveMatchesPlayed',
    method: 'countMatchesPlayedByTeam',
    resolve: (service, scope) =>
      service.resolveMatchesPlayed(scope as FactScope),
    rows: [{ teamId: 1, name: '40 grinders', count: 12 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 5 }],
    expectedTitle: 'Teams by matches played',
  },
  {
    describeName: 'resolveMatchesWon',
    method: 'countMatchesWonByTeam',
    resolve: (service, scope) => service.resolveMatchesWon(scope as FactScope),
    rows: [{ teamId: 1, name: '40 grinders', count: 7 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 3 }],
    expectedTitle: 'Teams by matches won',
  },
  {
    describeName: 'resolveMatchesLost',
    method: 'countMatchesLostByTeam',
    resolve: (service, scope) => service.resolveMatchesLost(scope as FactScope),
    rows: [{ teamId: 2, name: 'Reikland Reavers', count: 9 }],
    eraRows: [{ teamId: 2, name: 'Reikland Reavers', count: 4 }],
    expectedTitle: 'Teams by matches lost',
  },
  {
    describeName: 'resolveMatchesDrawn',
    method: 'countMatchesDrawnByTeam',
    resolve: (service, scope) =>
      service.resolveMatchesDrawn(scope as FactScope),
    rows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 1 }],
    expectedTitle: 'Teams by matches drawn',
  },
  {
    describeName: 'resolveCompetitionsPlayed',
    method: 'countCompetitionsByTeam',
    resolve: (service, scope) =>
      service.resolveCompetitionsPlayed(scope as FactScope),
    rows: [{ teamId: 1, name: '40 grinders', count: 4 }],
    eraRows: [{ teamId: 1, name: '40 grinders', count: 2 }],
    expectedTitle: 'Teams by competitions played',
  },
  {
    describeName: 'resolveErasActive',
    method: 'countErasByTeam',
    resolve: (service) => service.resolveErasActive(),
    rows: [{ teamId: 1, name: '40 grinders', count: 3 }],
    expectedTitle: 'Teams by eras active',
  },
];

describe.each(factoryCases)(
  'TeamToplistService.$describeName',
  ({ method, resolve, rows, expectedTitle, competitionRows }) => {
    // The resolver-to-LeaderboardService binding is ToplistFactoryService's
    // job, covered by toplist-factory.service.spec.ts. Here the factory is a
    // mock handing back inert resolvers, so these tests assert only what
    // TeamToplistService itself owns.
    it('wires the embed title and per-row deepdive button id', async () => {
      const teams = mock<TeamsService>();
      const { service, toplist } = await makeService(teams);
      const canned = {
        embeds: [{ title: 'canned', description: 'canned' }],
      };
      toplist.resolver(method).mockResolvedValueOnce(canned);
      const result = await resolve(service, FACT_SCOPE_ALL_TIME);
      expect(result).toBe(canned);
      const options = toplist.options();
      expect(options.titles[method]).toBe(expectedTitle);
      expect(options.entityLink?.customIdPrefix).toBe(
        TEAM_BUTTON_CUSTOM_ID_PREFIX,
      );
      expect(options.entityLink?.entityId(rows[0])).toBe(rows[0].teamId);
    });

    it('passes the era scope through to the factory resolver', async () => {
      const teams = mock<TeamsService>();
      const { service, toplist } = await makeService(teams);
      await resolve(service, { eraId: 20 });
      expect(toplist.resolver(method)).toHaveBeenCalledWith(teams, {
        eraId: 20,
      });
    });

    if (competitionRows) {
      it('passes the competition scope through to the factory resolver', async () => {
        const teams = mock<TeamsService>();
        const { service, toplist } = await makeService(teams);
        await resolve(service, { competitionId: 30 });
        expect(toplist.resolver(method)).toHaveBeenCalledWith(teams, {
          competitionId: 30,
        });
      });
    }

    it('configures the toplist-specific timeout message and returns the resolver reply verbatim', async () => {
      const teams = mock<TeamsService>();
      const { service, toplist } = await makeService(teams);
      toplist
        .resolver(method)
        .mockResolvedValueOnce(TEAM_TOPLIST_TIMEOUT_MESSAGE);
      const result = await resolve(service, FACT_SCOPE_ALL_TIME);
      expect(result).toBe(TEAM_TOPLIST_TIMEOUT_MESSAGE);
      expect(toplist.options().timeoutMessage).toBe(
        TEAM_TOPLIST_TIMEOUT_MESSAGE,
      );
    });

    it('decorates every fetched row with both race and coach context', async () => {
      const teams = mock<TeamsService>();
      const teamContext = mock<TeamContextService>();
      teamContext.attachSuffixes.mockResolvedValue(
        rows.map((row) => ({ ...row, contextSuffix: ' (Orc, Skarsnik)' })),
      );
      const { toplist } = await makeService(teams, teamContext);
      const decorated = await toplist
        .options()
        .decorateRows?.(rows, FACT_SCOPE_ALL_TIME);
      expect(teamContext.attachSuffixes).toHaveBeenCalledTimes(1);
      const [inputRows, teamIdOf, contextOptions] =
        teamContext.attachSuffixes.mock.calls[0];
      expect(inputRows).toEqual(rows);
      expect(teamIdOf(rows[0])).toBe(rows[0].teamId);
      expect(contextOptions).toEqual({ includeRace: true, includeCoach: true });
      expect(decorated).toEqual(
        rows.map((row) => ({ ...row, contextSuffix: ' (Orc, Skarsnik)' })),
      );
    });

    it('renders each row with its context suffix between the name and the count', async () => {
      const teams = mock<TeamsService>();
      const { toplist } = await makeService(teams);
      expect(
        toplist.options().formatRow?.({
          ...rows[0],
          contextSuffix: ' (Orc, Skarsnik)',
          rank: 3,
        }),
      ).toBe(`3. ${rows[0].name} (Orc, Skarsnik) — ${rows[0].count}`);
    });

    it('renders a row with no known context without stray parentheses', async () => {
      const teams = mock<TeamsService>();
      const { toplist } = await makeService(teams);
      expect(
        toplist
          .options()
          .formatRow?.({ ...rows[0], contextSuffix: '', rank: 1 }),
      ).toBe(`1. ${rows[0].name} — ${rows[0].count}`);
    });
  },
);

describe.each(handWrittenCases)(
  'TeamToplistService.$describeName',
  ({ method, resolve, rows, expectedTitle, eraRows, competitionRows }) => {
    // These six resolvers take a narrower scope than the factory's table
    // allows, so TeamToplistService still writes them by hand against the
    // mocked LeaderboardService.
    it('wires the embed title and per-row deepdive button id', async () => {
      const teams = mock<TeamsService>();
      teams[method].mockResolvedValue(rows);
      const { service, leaderboard } = await makeService(teams);
      const canned = {
        embeds: [{ title: 'canned', description: 'canned' }],
      };
      leaderboard.resolveToplist.mockResolvedValueOnce(canned);
      const result = await resolve(service, FACT_SCOPE_ALL_TIME);
      expect(result).toBe(canned);
      const options = leaderboard.resolveToplist.mock
        .calls[0][0] as unknown as ResolveToplistOptions<TeamRow>;
      expect(options.title).toBe(expectedTitle);
      expect(options.entityLink?.customIdPrefix).toBe(
        TEAM_BUTTON_CUSTOM_ID_PREFIX,
      );
      expect(options.entityLink?.entityId(rows[0])).toBe(rows[0].teamId);
    });

    if (eraRows) {
      it('passes the era id through to the query', async () => {
        const teams = mock<TeamsService>();
        const queryFn = teams[method];
        queryFn.mockResolvedValue(eraRows);
        const teamContext = mock<TeamContextService>();
        teamContext.attachSuffixes.mockResolvedValue(
          eraRows.map((row) => ({ ...row, contextSuffix: '' })),
        );
        const { service, leaderboard } = await makeService(teams, teamContext);
        leaderboard.resolveToplist.mockImplementation(async (options) => {
          await options.fetchRows(TOPLIST_FETCH_LIMIT);
          return 'canned';
        });
        await resolve(service, { eraId: 20 });
        expect(queryFn).toHaveBeenCalledWith(
          { eraId: 20 },
          TOPLIST_FETCH_LIMIT,
        );
      });
    }

    if (competitionRows) {
      it('passes the competition id through to the query', async () => {
        const teams = mock<TeamsService>();
        const queryFn = teams[method];
        queryFn.mockResolvedValue(competitionRows);
        const teamContext = mock<TeamContextService>();
        teamContext.attachSuffixes.mockResolvedValue(
          competitionRows.map((row) => ({ ...row, contextSuffix: '' })),
        );
        const { service, leaderboard } = await makeService(teams, teamContext);
        leaderboard.resolveToplist.mockImplementation(async (options) => {
          await options.fetchRows(TOPLIST_FETCH_LIMIT);
          return 'canned';
        });
        await resolve(service, { competitionId: 30 });
        expect(queryFn).toHaveBeenCalledWith(
          { competitionId: 30 },
          TOPLIST_FETCH_LIMIT,
        );
      });
    }

    it('configures the toplist-specific timeout message and returns it verbatim on timeout', async () => {
      const teams = mock<TeamsService>();
      teams[method].mockResolvedValue(rows);
      const { service, leaderboard } = await makeService(teams);
      leaderboard.resolveToplist.mockResolvedValueOnce(
        TEAM_TOPLIST_TIMEOUT_MESSAGE,
      );
      const result = await resolve(service, FACT_SCOPE_ALL_TIME);
      expect(result).toBe(TEAM_TOPLIST_TIMEOUT_MESSAGE);
      expect(leaderboard.resolveToplist).toHaveBeenCalledWith(
        expect.objectContaining({
          timeoutMessage: TEAM_TOPLIST_TIMEOUT_MESSAGE,
        }),
      );
    });

    it('decorates every fetched row with both race and coach context', async () => {
      const teams = mock<TeamsService>();
      teams[method].mockResolvedValue(rows);
      const teamContext = mock<TeamContextService>();
      teamContext.attachSuffixes.mockResolvedValue(
        rows.map((row) => ({ ...row, contextSuffix: ' (Orc, Skarsnik)' })),
      );
      const { service, leaderboard } = await makeService(teams, teamContext);
      let fetched: unknown;
      leaderboard.resolveToplist.mockImplementation(async (options) => {
        fetched = await options.fetchRows(TOPLIST_FETCH_LIMIT);
        return 'canned';
      });
      await resolve(service, FACT_SCOPE_ALL_TIME);
      expect(teamContext.attachSuffixes).toHaveBeenCalledTimes(1);
      const [inputRows, teamIdOf, contextOptions] =
        teamContext.attachSuffixes.mock.calls[0];
      expect(inputRows).toEqual(rows);
      expect(teamIdOf(rows[0])).toBe(rows[0].teamId);
      expect(contextOptions).toEqual({ includeRace: true, includeCoach: true });
      expect(fetched).toEqual(
        rows.map((row) => ({ ...row, contextSuffix: ' (Orc, Skarsnik)' })),
      );
    });

    it('renders each row with its context suffix between the name and the count', async () => {
      const teams = mock<TeamsService>();
      teams[method].mockResolvedValue(rows);
      const { service, leaderboard } = await makeService(teams);
      leaderboard.resolveToplist.mockResolvedValueOnce('canned');
      await resolve(service, FACT_SCOPE_ALL_TIME);
      const options = leaderboard.resolveToplist.mock
        .calls[0][0] as unknown as ResolveToplistOptions<TeamRow>;
      expect(
        options.formatRow?.({
          ...rows[0],
          contextSuffix: ' (Orc, Skarsnik)',
          rank: 3,
        }),
      ).toBe(`3. ${rows[0].name} (Orc, Skarsnik) — ${rows[0].count}`);
    });

    it('renders a row with no known context without stray parentheses', async () => {
      const teams = mock<TeamsService>();
      teams[method].mockResolvedValue(rows);
      const { service, leaderboard } = await makeService(teams);
      leaderboard.resolveToplist.mockResolvedValueOnce('canned');
      await resolve(service, FACT_SCOPE_ALL_TIME);
      const options = leaderboard.resolveToplist.mock
        .calls[0][0] as unknown as ResolveToplistOptions<TeamRow>;
      expect(
        options.formatRow?.({ ...rows[0], contextSuffix: '', rank: 1 }),
      ).toBe(`1. ${rows[0].name} — ${rows[0].count}`);
    });
  },
);

describe('TeamToplistService.resolveErasActive', () => {
  it('passes the fetch limit through to the query', async () => {
    const teams = mock<TeamsService>();
    const queryFn = teams.countErasByTeam;
    queryFn.mockResolvedValue([]);
    const teamContext = mock<TeamContextService>();
    teamContext.attachSuffixes.mockResolvedValue([]);
    const { service, leaderboard } = await makeService(teams, teamContext);
    leaderboard.resolveToplist.mockImplementation(async (options) => {
      await options.fetchRows(TOPLIST_FETCH_LIMIT);
      return 'canned';
    });
    await service.resolveErasActive();
    expect(queryFn).toHaveBeenCalledWith(TOPLIST_FETCH_LIMIT);
  });
});
