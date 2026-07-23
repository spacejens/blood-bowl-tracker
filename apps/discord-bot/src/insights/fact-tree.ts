import { DatabaseTimeoutService } from '../database-timeout.service';
import type { FactNode } from './fact-tree.types';
import { CoachToplistService } from './facts/coach-toplist.service';
import { ErasListService } from './facts/eras-list.service';
import { ExpensiveMistakesToplistService } from './facts/expensive-mistakes-toplist.service';
import {
  resolvePlayerCasualtiesCausedToplist,
  resolvePlayerCasualtiesSufferedToplist,
  resolvePlayerCompletionsToplist,
  resolvePlayerDeathsCausedToplist,
  resolvePlayerDeflectionsToplist,
  resolvePlayerFoulsCommittedToplist,
  resolvePlayerInterceptionsToplist,
  resolvePlayerLastingInjuriesSufferedToplist,
  resolvePlayerMvpsToplist,
  resolvePlayerSeriousInjuriesCausedToplist,
  resolvePlayerSeriousInjuriesSufferedToplist,
  resolvePlayerTimesSentOffToplist,
  resolvePlayerTouchdownsScoredToplist,
} from './facts/player-toplist';
import { RaceToplistService } from './facts/race-toplist.service';
import type { StatsSummaryDeps } from './facts/stats-summary';
import { resolveStatsSummary } from './facts/stats-summary';
import {
  resolveTeamCasualtiesCausedToplist,
  resolveTeamCasualtiesSufferedToplist,
  resolveTeamCompetitionsPlayedToplist,
  resolveTeamCompletionsToplist,
  resolveTeamDeathsCausedToplist,
  resolveTeamDeathsSufferedToplist,
  resolveTeamDeflectionsToplist,
  resolveTeamErasActiveToplist,
  resolveTeamFoulsCommittedToplist,
  resolveTeamInterceptionsToplist,
  resolveTeamLastingInjuriesSufferedToplist,
  resolveTeamMatchesPlayedToplist,
  resolveTeamSeriousInjuriesCausedToplist,
  resolveTeamSeriousInjuriesSufferedToplist,
  resolveTeamTimesSentOffToplist,
  resolveTeamTouchdownsScoredToplist,
} from './facts/team-toplist';
import { LeaderboardService } from './leaderboard.service';

/**
 * buildFactTree is a pure function invoked once by FactTreeFactoryService, so
 * the toplist services converted so far (coach/race/expensive-mistakes/eras)
 * are instantiated directly here rather than injected — the remaining
 * loose-function fact resolvers (team/player) aren't NestJS providers yet, so
 * this factory doesn't have a DI container to pull from until later tasks
 * finish the conversion.
 */
export function buildFactTree(deps: StatsSummaryDeps): FactNode {
  const leaderboard = new LeaderboardService(new DatabaseTimeoutService());
  const coachToplist = new CoachToplistService(deps.coaches, leaderboard);
  const raceToplist = new RaceToplistService(deps.races, leaderboard);
  const expensiveMistakesToplist = new ExpensiveMistakesToplistService(
    deps.teams,
    leaderboard,
  );
  const erasList = new ErasListService(deps.eras, new DatabaseTimeoutService());
  return {
    coach: {
      toplist: {
        matches: {
          played: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: false,
            resolve: (scope) => coachToplist.resolveMatchesPlayed(scope),
          },
        },
        teams: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: false,
          resolve: (scope) => coachToplist.resolveTeams(scope),
        },
        competitions: {
          played: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: false,
            resolve: (scope) => coachToplist.resolveCompetitionsPlayed(scope),
          },
        },
        eras: {
          active: {
            supportsLeague: false,
            supportsEra: false,
            supportsCompetition: false,
            resolve: () => coachToplist.resolveErasActive(),
          },
        },
      },
    },
    team: {
      toplist: {
        matches: {
          played: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: false,
            resolve: (scope) =>
              resolveTeamMatchesPlayedToplist(deps.teams, scope),
          },
        },
        competitions: {
          played: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: false,
            resolve: (scope) =>
              resolveTeamCompetitionsPlayedToplist(deps.teams, scope),
          },
        },
        eras: {
          active: {
            supportsLeague: false,
            supportsEra: false,
            supportsCompetition: false,
            resolve: () => resolveTeamErasActiveToplist(deps.teams),
          },
        },
        touchdowns: {
          scored: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            resolve: (scope) =>
              resolveTeamTouchdownsScoredToplist(deps.teams, scope),
          },
        },
        completions: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: true,
          resolve: (scope) => resolveTeamCompletionsToplist(deps.teams, scope),
        },
        interceptions: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: true,
          resolve: (scope) =>
            resolveTeamInterceptionsToplist(deps.teams, scope),
        },
        deflections: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: true,
          resolve: (scope) => resolveTeamDeflectionsToplist(deps.teams, scope),
        },
        casualties: {
          caused: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            resolve: (scope) =>
              resolveTeamCasualtiesCausedToplist(deps.teams, scope),
          },
          suffered: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            resolve: (scope) =>
              resolveTeamCasualtiesSufferedToplist(deps.teams, scope),
          },
        },
        injuries: {
          serious: {
            caused: {
              supportsLeague: true,
              supportsEra: true,
              supportsCompetition: true,
              resolve: (scope) =>
                resolveTeamSeriousInjuriesCausedToplist(deps.teams, scope),
            },
            suffered: {
              supportsLeague: true,
              supportsEra: true,
              supportsCompetition: true,
              resolve: (scope) =>
                resolveTeamSeriousInjuriesSufferedToplist(deps.teams, scope),
            },
          },
          lasting: {
            suffered: {
              supportsLeague: true,
              supportsEra: true,
              supportsCompetition: true,
              resolve: (scope) =>
                resolveTeamLastingInjuriesSufferedToplist(deps.teams, scope),
            },
          },
        },
        deaths: {
          caused: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            resolve: (scope) =>
              resolveTeamDeathsCausedToplist(deps.teams, scope),
          },
          suffered: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            resolve: (scope) =>
              resolveTeamDeathsSufferedToplist(deps.teams, scope),
          },
        },
        fouls: {
          committed: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            resolve: (scope) =>
              resolveTeamFoulsCommittedToplist(deps.teams, scope),
          },
        },
        sent_off: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: true,
          resolve: (scope) => resolveTeamTimesSentOffToplist(deps.teams, scope),
        },
        expensiveMistakes: {
          total: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            resolve: (scope) => expensiveMistakesToplist.resolveTotal(scope),
          },
          biggest: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            resolve: (scope) => expensiveMistakesToplist.resolveBiggest(scope),
          },
        },
      },
    },
    player: {
      toplist: {
        mvps: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: true,
          resolve: (scope) => resolvePlayerMvpsToplist(deps.players, scope),
        },
        touchdowns: {
          scored: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            resolve: (scope) =>
              resolvePlayerTouchdownsScoredToplist(deps.players, scope),
          },
        },
        completions: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: true,
          resolve: (scope) =>
            resolvePlayerCompletionsToplist(deps.players, scope),
        },
        interceptions: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: true,
          resolve: (scope) =>
            resolvePlayerInterceptionsToplist(deps.players, scope),
        },
        deflections: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: true,
          resolve: (scope) =>
            resolvePlayerDeflectionsToplist(deps.players, scope),
        },
        casualties: {
          caused: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            resolve: (scope) =>
              resolvePlayerCasualtiesCausedToplist(deps.players, scope),
          },
          suffered: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            resolve: (scope) =>
              resolvePlayerCasualtiesSufferedToplist(deps.players, scope),
          },
        },
        injuries: {
          serious: {
            caused: {
              supportsLeague: true,
              supportsEra: true,
              supportsCompetition: true,
              resolve: (scope) =>
                resolvePlayerSeriousInjuriesCausedToplist(deps.players, scope),
            },
            suffered: {
              supportsLeague: true,
              supportsEra: true,
              supportsCompetition: true,
              resolve: (scope) =>
                resolvePlayerSeriousInjuriesSufferedToplist(
                  deps.players,
                  scope,
                ),
            },
          },
          lasting: {
            suffered: {
              supportsLeague: true,
              supportsEra: true,
              supportsCompetition: true,
              resolve: (scope) =>
                resolvePlayerLastingInjuriesSufferedToplist(
                  deps.players,
                  scope,
                ),
            },
          },
        },
        deaths: {
          caused: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            resolve: (scope) =>
              resolvePlayerDeathsCausedToplist(deps.players, scope),
          },
        },
        fouls: {
          committed: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            resolve: (scope) =>
              resolvePlayerFoulsCommittedToplist(deps.players, scope),
          },
        },
        sent_off: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: true,
          resolve: (scope) =>
            resolvePlayerTimesSentOffToplist(deps.players, scope),
        },
      },
    },
    race: {
      toplist: {
        teams: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: false,
          resolve: (scope) => raceToplist.resolveTeams(scope),
        },
        matches: {
          played: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: false,
            resolve: (scope) => raceToplist.resolveMatchesPlayed(scope),
          },
        },
      },
    },
    eras: {
      list: {
        supportsLeague: true,
        supportsEra: false,
        supportsCompetition: false,
        resolve: (scope) => erasList.resolve(scope),
      },
    },
    stats: {
      supportsLeague: true,
      supportsEra: true,
      supportsCompetition: true,
      resolve: (scope) => resolveStatsSummary(deps, scope),
    },
  };
}
