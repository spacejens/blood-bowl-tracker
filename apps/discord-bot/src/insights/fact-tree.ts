import type { FactNode } from './fact-tree-utils';
import {
  resolveCoachCompetitionsPlayedToplist,
  resolveCoachErasActiveToplist,
  resolveCoachMatchesPlayedToplist,
  resolveCoachTeamsToplist,
} from './facts/coach-toplist';
import { resolveErasList } from './facts/eras-list';
import {
  resolveTeamExpensiveMistakesBiggestToplist,
  resolveTeamExpensiveMistakesTotalToplist,
} from './facts/expensive-mistakes-toplist';
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
import {
  resolveRaceMatchesPlayedToplist,
  resolveRaceTeamsToplist,
} from './facts/race-toplist';
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

export function buildFactTree(deps: StatsSummaryDeps): FactNode {
  return {
    coach: {
      toplist: {
        matches: {
          played: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: false,
            resolve: (scope) =>
              resolveCoachMatchesPlayedToplist(deps.coaches, scope),
          },
        },
        teams: {
          supportsLeague: true,
          supportsEra: true,
          supportsCompetition: false,
          resolve: (scope) => resolveCoachTeamsToplist(deps.coaches, scope),
        },
        competitions: {
          played: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: false,
            resolve: (scope) =>
              resolveCoachCompetitionsPlayedToplist(deps.coaches, scope),
          },
        },
        eras: {
          active: {
            supportsLeague: false,
            supportsEra: false,
            supportsCompetition: false,
            resolve: () => resolveCoachErasActiveToplist(deps.coaches),
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
            resolve: (scope) =>
              resolveTeamExpensiveMistakesTotalToplist(deps.teams, scope),
          },
          biggest: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: true,
            resolve: (scope) =>
              resolveTeamExpensiveMistakesBiggestToplist(deps.teams, scope),
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
          resolve: (scope) => resolveRaceTeamsToplist(deps.races, scope),
        },
        matches: {
          played: {
            supportsLeague: true,
            supportsEra: true,
            supportsCompetition: false,
            resolve: (scope) =>
              resolveRaceMatchesPlayedToplist(deps.races, scope),
          },
        },
      },
    },
    eras: {
      list: {
        supportsLeague: false,
        supportsEra: false,
        supportsCompetition: false,
        resolve: () => resolveErasList(deps.eras),
      },
    },
    stats: {
      supportsLeague: false,
      supportsEra: true,
      supportsCompetition: true,
      resolve: (scope) => resolveStatsSummary(deps, scope),
    },
  };
}
