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
            supportsEra: true,
            supportsCompetition: false,
            supportsLeague: true,
            resolve: (scope) =>
              resolveCoachMatchesPlayedToplist(deps.coaches, scope),
          },
        },
        teams: {
          supportsEra: true,
          supportsCompetition: false,
          supportsLeague: true,
          resolve: (scope) => resolveCoachTeamsToplist(deps.coaches, scope),
        },
        competitions: {
          played: {
            supportsEra: true,
            supportsCompetition: false,
            supportsLeague: true,
            resolve: (scope) =>
              resolveCoachCompetitionsPlayedToplist(deps.coaches, scope),
          },
        },
        eras: {
          active: {
            supportsEra: false,
            supportsCompetition: false,
            supportsLeague: false,
            resolve: () => resolveCoachErasActiveToplist(deps.coaches),
          },
        },
      },
    },
    team: {
      toplist: {
        matches: {
          played: {
            supportsEra: true,
            supportsCompetition: false,
            supportsLeague: true,
            resolve: (scope) =>
              resolveTeamMatchesPlayedToplist(deps.teams, scope),
          },
        },
        competitions: {
          played: {
            supportsEra: true,
            supportsCompetition: false,
            supportsLeague: true,
            resolve: (scope) =>
              resolveTeamCompetitionsPlayedToplist(deps.teams, scope),
          },
        },
        eras: {
          active: {
            supportsEra: false,
            supportsCompetition: false,
            supportsLeague: false,
            resolve: () => resolveTeamErasActiveToplist(deps.teams),
          },
        },
        touchdowns: {
          scored: {
            supportsEra: true,
            supportsCompetition: true,
            supportsLeague: true,
            resolve: (scope) =>
              resolveTeamTouchdownsScoredToplist(deps.teams, scope),
          },
        },
        completions: {
          supportsEra: true,
          supportsCompetition: true,
          supportsLeague: true,
          resolve: (scope) => resolveTeamCompletionsToplist(deps.teams, scope),
        },
        interceptions: {
          supportsEra: true,
          supportsCompetition: true,
          supportsLeague: true,
          resolve: (scope) =>
            resolveTeamInterceptionsToplist(deps.teams, scope),
        },
        deflections: {
          supportsEra: true,
          supportsCompetition: true,
          supportsLeague: true,
          resolve: (scope) => resolveTeamDeflectionsToplist(deps.teams, scope),
        },
        casualties: {
          caused: {
            supportsEra: true,
            supportsCompetition: true,
            supportsLeague: true,
            resolve: (scope) =>
              resolveTeamCasualtiesCausedToplist(deps.teams, scope),
          },
          suffered: {
            supportsEra: true,
            supportsCompetition: true,
            supportsLeague: true,
            resolve: (scope) =>
              resolveTeamCasualtiesSufferedToplist(deps.teams, scope),
          },
        },
        injuries: {
          serious: {
            caused: {
              supportsEra: true,
              supportsCompetition: true,
              supportsLeague: true,
              resolve: (scope) =>
                resolveTeamSeriousInjuriesCausedToplist(deps.teams, scope),
            },
            suffered: {
              supportsEra: true,
              supportsCompetition: true,
              supportsLeague: true,
              resolve: (scope) =>
                resolveTeamSeriousInjuriesSufferedToplist(deps.teams, scope),
            },
          },
          lasting: {
            suffered: {
              supportsEra: true,
              supportsCompetition: true,
              supportsLeague: true,
              resolve: (scope) =>
                resolveTeamLastingInjuriesSufferedToplist(deps.teams, scope),
            },
          },
        },
        deaths: {
          caused: {
            supportsEra: true,
            supportsCompetition: true,
            supportsLeague: true,
            resolve: (scope) =>
              resolveTeamDeathsCausedToplist(deps.teams, scope),
          },
          suffered: {
            supportsEra: true,
            supportsCompetition: true,
            supportsLeague: true,
            resolve: (scope) =>
              resolveTeamDeathsSufferedToplist(deps.teams, scope),
          },
        },
        fouls: {
          committed: {
            supportsEra: true,
            supportsCompetition: true,
            supportsLeague: true,
            resolve: (scope) =>
              resolveTeamFoulsCommittedToplist(deps.teams, scope),
          },
        },
        sent_off: {
          supportsEra: true,
          supportsCompetition: true,
          supportsLeague: true,
          resolve: (scope) => resolveTeamTimesSentOffToplist(deps.teams, scope),
        },
        expensiveMistakes: {
          total: {
            supportsEra: true,
            supportsCompetition: true,
            supportsLeague: true,
            resolve: (scope) =>
              resolveTeamExpensiveMistakesTotalToplist(deps.teams, scope),
          },
          biggest: {
            supportsEra: true,
            supportsCompetition: true,
            supportsLeague: true,
            resolve: (scope) =>
              resolveTeamExpensiveMistakesBiggestToplist(deps.teams, scope),
          },
        },
      },
    },
    player: {
      toplist: {
        mvps: {
          supportsEra: true,
          supportsCompetition: true,
          supportsLeague: true,
          resolve: (scope) => resolvePlayerMvpsToplist(deps.players, scope),
        },
        touchdowns: {
          scored: {
            supportsEra: true,
            supportsCompetition: true,
            supportsLeague: true,
            resolve: (scope) =>
              resolvePlayerTouchdownsScoredToplist(deps.players, scope),
          },
        },
        completions: {
          supportsEra: true,
          supportsCompetition: true,
          supportsLeague: true,
          resolve: (scope) =>
            resolvePlayerCompletionsToplist(deps.players, scope),
        },
        interceptions: {
          supportsEra: true,
          supportsCompetition: true,
          supportsLeague: true,
          resolve: (scope) =>
            resolvePlayerInterceptionsToplist(deps.players, scope),
        },
        deflections: {
          supportsEra: true,
          supportsCompetition: true,
          supportsLeague: true,
          resolve: (scope) =>
            resolvePlayerDeflectionsToplist(deps.players, scope),
        },
        casualties: {
          caused: {
            supportsEra: true,
            supportsCompetition: true,
            supportsLeague: true,
            resolve: (scope) =>
              resolvePlayerCasualtiesCausedToplist(deps.players, scope),
          },
          suffered: {
            supportsEra: true,
            supportsCompetition: true,
            supportsLeague: true,
            resolve: (scope) =>
              resolvePlayerCasualtiesSufferedToplist(deps.players, scope),
          },
        },
        injuries: {
          serious: {
            caused: {
              supportsEra: true,
              supportsCompetition: true,
              supportsLeague: true,
              resolve: (scope) =>
                resolvePlayerSeriousInjuriesCausedToplist(deps.players, scope),
            },
            suffered: {
              supportsEra: true,
              supportsCompetition: true,
              supportsLeague: true,
              resolve: (scope) =>
                resolvePlayerSeriousInjuriesSufferedToplist(
                  deps.players,
                  scope,
                ),
            },
          },
          lasting: {
            suffered: {
              supportsEra: true,
              supportsCompetition: true,
              supportsLeague: true,
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
            supportsEra: true,
            supportsCompetition: true,
            supportsLeague: true,
            resolve: (scope) =>
              resolvePlayerDeathsCausedToplist(deps.players, scope),
          },
        },
        fouls: {
          committed: {
            supportsEra: true,
            supportsCompetition: true,
            supportsLeague: true,
            resolve: (scope) =>
              resolvePlayerFoulsCommittedToplist(deps.players, scope),
          },
        },
        sent_off: {
          supportsEra: true,
          supportsCompetition: true,
          supportsLeague: true,
          resolve: (scope) =>
            resolvePlayerTimesSentOffToplist(deps.players, scope),
        },
      },
    },
    race: {
      toplist: {
        teams: {
          supportsEra: true,
          supportsCompetition: false,
          supportsLeague: true,
          resolve: (scope) => resolveRaceTeamsToplist(deps.races, scope),
        },
        matches: {
          played: {
            supportsEra: true,
            supportsCompetition: false,
            supportsLeague: true,
            resolve: (scope) =>
              resolveRaceMatchesPlayedToplist(deps.races, scope),
          },
        },
      },
    },
    eras: {
      list: {
        supportsEra: false,
        supportsCompetition: false,
        supportsLeague: false,
        resolve: () => resolveErasList(deps.eras),
      },
    },
    stats: {
      supportsEra: true,
      supportsCompetition: true,
      supportsLeague: false,
      resolve: (scope) => resolveStatsSummary(deps, scope),
    },
  };
}
