import type {
  CoachesService,
  CompetitionsService,
  ErasService,
  ExternalSystemsService,
  LeaguesService,
  MatchesService,
  PlayersService,
  PositionsService,
  RacesService,
  RulesSetsService,
  TeamsService,
} from '@blood-bowl-tracker/game-data';
import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
} from 'discord.js';
import { vi } from 'vitest';

import { DatabaseTimeoutService } from '../database-timeout.service';
import { buildFactTree } from '../insights/fact-tree';
import { FactTreeUtilsService } from '../insights/fact-tree-utils.service';
import { CoachToplistService } from '../insights/facts/coach-toplist.service';
import { ErasListService } from '../insights/facts/eras-list.service';
import { ExpensiveMistakesToplistService } from '../insights/facts/expensive-mistakes-toplist.service';
import { PlayerToplistService } from '../insights/facts/player-toplist.service';
import { RaceToplistService } from '../insights/facts/race-toplist.service';
import { StatsSummaryFactsService } from '../insights/facts/stats-summary.service';
import { TeamToplistService } from '../insights/facts/team-toplist.service';
import { LeaderboardService } from '../insights/leaderboard.service';
import { InsightsCommandService } from './insights-command.service';
import type { SlashCommandRegistryService } from './slash-command-registry.service';

/**
 * Test-only helpers for the `/insights` command service specs.
 * Do not import from production code.
 */
export function makeService() {
  const zero = () => ({
    countAll: vi.fn().mockResolvedValue(0),
    countByEra: vi.fn().mockResolvedValue(0),
    countByCompetition: vi.fn().mockResolvedValue(0),
  });
  const coaches = {
    countMatchesPlayedByCoach: vi
      .fn()
      .mockResolvedValue([{ coachId: 1, name: 'Roze Madder', count: 9 }]),
    countTeamsByCoach: vi
      .fn()
      .mockResolvedValue([{ coachId: 1, name: 'Roze Madder', count: 3 }]),
    countCompetitionsByCoach: vi
      .fn()
      .mockResolvedValue([{ coachId: 1, name: 'Roze Madder', count: 5 }]),
    countErasByCoach: vi
      .fn()
      .mockResolvedValue([{ coachId: 1, name: 'Roze Madder', count: 3 }]),
    countAll: vi.fn().mockResolvedValue(0),
    countByEra: vi.fn().mockResolvedValue(0),
    countByCompetition: vi.fn().mockResolvedValue(0),
  } as unknown as CoachesService;
  const teams = {
    countMatchesPlayedByTeam: vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 12 }]),
    countCompetitionsByTeam: vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 4 }]),
    countErasByTeam: vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 3 }]),
    countTouchdownsScoredByTeam: vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 15 }]),
    countCompletionsByTeam: vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 8 }]),
    countInterceptionsByTeam: vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 5 }]),
    countDeflectionsByTeam: vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 4 }]),
    countCasualtiesCausedByTeam: vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 22 }]),
    countSeriousInjuriesCausedByTeam: vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 7 }]),
    countDeathsCausedByTeam: vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 4 }]),
    countCasualtiesSufferedByTeam: vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 18 }]),
    countSeriousInjuriesSufferedByTeam: vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 6 }]),
    countLastingInjuriesSufferedByTeam: vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 4 }]),
    countDeathsSufferedByTeam: vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 2 }]),
    countFoulsCommittedByTeam: vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 13 }]),
    countTimesSentOffByTeam: vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 8 }]),
    sumExpensiveMistakesByTeam: vi
      .fn()
      .mockResolvedValue([{ teamId: 1, name: '40 grinders', count: 150000 }]),
    listBiggestExpensiveMistakes: vi.fn().mockResolvedValue([
      {
        teamId: 1,
        name: '40 grinders',
        count: 150000,
        date: '2026-03-04',
      },
    ]),
    countAll: vi.fn().mockResolvedValue(0),
    countByEra: vi.fn().mockResolvedValue(0),
    countByCompetition: vi.fn().mockResolvedValue(0),
  } as unknown as TeamsService;
  const matches = {
    countAll: vi.fn().mockResolvedValue(0),
    countMatchEvents: vi.fn().mockResolvedValue(0),
    countByEra: vi.fn().mockResolvedValue(0),
    countMatchEventsByEra: vi.fn().mockResolvedValue(0),
    countByCompetition: vi.fn().mockResolvedValue(0),
    countMatchEventsByCompetition: vi.fn().mockResolvedValue(0),
  } as unknown as MatchesService;
  const competitions = {
    countAll: vi.fn().mockResolvedValue(0),
    countByType: vi.fn().mockResolvedValue(0),
    countByEra: vi.fn().mockResolvedValue(0),
    findById: vi.fn().mockResolvedValue(undefined),
    searchByNamePrefix: vi.fn().mockResolvedValue([]),
  } as unknown as CompetitionsService;
  const leagues = {
    ...zero(),
    findById: vi.fn().mockResolvedValue(undefined),
    searchByNamePrefix: vi.fn().mockResolvedValue([]),
  } as unknown as LeaguesService;
  const rulesSets = zero() as unknown as RulesSetsService;
  const eras = {
    findById: vi.fn().mockResolvedValue(undefined),
    searchByNamePrefix: vi.fn().mockResolvedValue([]),
    countAll: vi.fn().mockResolvedValue(0),
    getRulesSetNames: vi.fn().mockResolvedValue([]),
    listErasWithLeague: vi.fn().mockResolvedValue([]),
  } as unknown as ErasService;
  const players = {
    countMvpAwardsByPlayer: vi
      .fn()
      .mockResolvedValue([{ playerId: 1, name: 'Griff Oberwald', count: 7 }]),
    countTouchdownsScoredByPlayer: vi
      .fn()
      .mockResolvedValue([{ playerId: 1, name: 'Griff Oberwald', count: 9 }]),
    countCompletionsByPlayer: vi
      .fn()
      .mockResolvedValue([{ playerId: 1, name: 'Griff Oberwald', count: 6 }]),
    countInterceptionsByPlayer: vi
      .fn()
      .mockResolvedValue([{ playerId: 1, name: 'Griff Oberwald', count: 5 }]),
    countDeflectionsByPlayer: vi
      .fn()
      .mockResolvedValue([{ playerId: 1, name: 'Griff Oberwald', count: 4 }]),
    countCasualtiesCausedByPlayer: vi
      .fn()
      .mockResolvedValue([{ playerId: 1, name: 'Morg n Thorg', count: 11 }]),
    countSeriousInjuriesCausedByPlayer: vi
      .fn()
      .mockResolvedValue([{ playerId: 1, name: 'Morg n Thorg', count: 3 }]),
    countDeathsCausedByPlayer: vi
      .fn()
      .mockResolvedValue([{ playerId: 1, name: 'Morg n Thorg', count: 2 }]),
    countCasualtiesSufferedByPlayer: vi
      .fn()
      .mockResolvedValue([{ playerId: 1, name: 'Griff Oberwald', count: 12 }]),
    countSeriousInjuriesSufferedByPlayer: vi
      .fn()
      .mockResolvedValue([{ playerId: 1, name: 'Griff Oberwald', count: 5 }]),
    countLastingInjuriesSufferedByPlayer: vi
      .fn()
      .mockResolvedValue([{ playerId: 1, name: 'Griff Oberwald', count: 4 }]),
    countFoulsCommittedByPlayer: vi
      .fn()
      .mockResolvedValue([{ playerId: 1, name: 'Morg n Thorg', count: 6 }]),
    countTimesSentOffByPlayer: vi
      .fn()
      .mockResolvedValue([{ playerId: 1, name: 'Morg n Thorg', count: 5 }]),
    countAll: vi.fn().mockResolvedValue(0),
    countByEra: vi.fn().mockResolvedValue(0),
    countByCompetition: vi.fn().mockResolvedValue(0),
  } as unknown as PlayersService;
  const positions = zero() as unknown as PositionsService;
  const races = {
    countTeamsByRace: vi
      .fn()
      .mockResolvedValue([{ raceId: 1, name: 'Orc', count: 12 }]),
    countMatchesPlayedByRace: vi
      .fn()
      .mockResolvedValue([{ raceId: 1, name: 'Orc', count: 40 }]),
    countAll: vi.fn().mockResolvedValue(0),
    countByEra: vi.fn().mockResolvedValue(0),
    countByCompetition: vi.fn().mockResolvedValue(0),
  } as unknown as RacesService;
  const externalSystems = zero() as unknown as ExternalSystemsService;
  const registry = {
    register: vi.fn(),
  };
  const databaseTimeout = new DatabaseTimeoutService();
  const leaderboard = new LeaderboardService(databaseTimeout);
  const factTree = buildFactTree({
    coachToplist: new CoachToplistService(coaches, leaderboard),
    teamToplist: new TeamToplistService(teams, leaderboard),
    playerToplist: new PlayerToplistService(players, leaderboard),
    raceToplist: new RaceToplistService(races, leaderboard),
    expensiveMistakes: new ExpensiveMistakesToplistService(teams, leaderboard),
    erasList: new ErasListService(eras, databaseTimeout),
    statsSummary: new StatsSummaryFactsService(
      leagues,
      externalSystems,
      rulesSets,
      races,
      positions,
      coaches,
      eras,
      competitions,
      teams,
      players,
      matches,
      databaseTimeout,
    ),
  });
  return {
    service: new InsightsCommandService(
      leagues,
      eras,
      competitions,
      factTree,
      registry as unknown as SlashCommandRegistryService,
      new FactTreeUtilsService(),
    ),
    coaches,
    teams,
    players,
    eras,
    races,
    competitions,
    leagues,
    registry,
  };
}

export function chatInput(
  category: string | null,
  scope: {
    era?: string | null;
    competition?: string | null;
    league?: string | null;
  } = {},
): ChatInputCommandInteraction {
  const { era = null, competition = null, league = null } = scope;
  return {
    options: {
      getString: vi.fn((name: string) =>
        name === 'era'
          ? era
          : name === 'competition'
            ? competition
            : name === 'league'
              ? league
              : category,
      ),
    },
  } as unknown as ChatInputCommandInteraction;
}

export function autocompleteInteraction(
  name: string,
  value: string,
): AutocompleteInteraction {
  return {
    options: {
      getFocused: vi.fn((full?: boolean) =>
        full ? { name, value, type: 3, focused: true } : value,
      ),
    },
  } as unknown as AutocompleteInteraction;
}
