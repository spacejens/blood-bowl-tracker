import type { FactNode } from './fact-tree-utils';
import {
  resolveCoachCompetitionsPlayedToplist,
  resolveCoachErasActiveToplist,
  resolveCoachMatchesPlayedToplist,
  resolveCoachTeamsToplist,
} from './facts/coach-toplist';
import { resolveErasList } from './facts/eras-list';
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
            resolve: (eraId) =>
              resolveCoachMatchesPlayedToplist(deps.coaches, eraId),
          },
        },
        teams: {
          supportsEra: true,
          resolve: (eraId) => resolveCoachTeamsToplist(deps.coaches, eraId),
        },
        competitions: {
          played: {
            supportsEra: true,
            resolve: (eraId) =>
              resolveCoachCompetitionsPlayedToplist(deps.coaches, eraId),
          },
        },
        eras: {
          active: {
            supportsEra: false,
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
            resolve: (eraId) =>
              resolveTeamMatchesPlayedToplist(deps.teams, eraId),
          },
        },
        competitions: {
          played: {
            supportsEra: true,
            resolve: (eraId) =>
              resolveTeamCompetitionsPlayedToplist(deps.teams, eraId),
          },
        },
        eras: {
          active: {
            supportsEra: false,
            resolve: () => resolveTeamErasActiveToplist(deps.teams),
          },
        },
        touchdowns: {
          scored: {
            supportsEra: true,
            resolve: (eraId) =>
              resolveTeamTouchdownsScoredToplist(deps.teams, eraId),
          },
        },
        completions: {
          supportsEra: true,
          resolve: (eraId) => resolveTeamCompletionsToplist(deps.teams, eraId),
        },
        interceptions: {
          supportsEra: true,
          resolve: (eraId) =>
            resolveTeamInterceptionsToplist(deps.teams, eraId),
        },
        deflections: {
          supportsEra: true,
          resolve: (eraId) => resolveTeamDeflectionsToplist(deps.teams, eraId),
        },
        casualties: {
          caused: {
            supportsEra: true,
            resolve: (eraId) =>
              resolveTeamCasualtiesCausedToplist(deps.teams, eraId),
          },
          suffered: {
            supportsEra: true,
            resolve: (eraId) =>
              resolveTeamCasualtiesSufferedToplist(deps.teams, eraId),
          },
        },
        injuries: {
          serious: {
            caused: {
              supportsEra: true,
              resolve: (eraId) =>
                resolveTeamSeriousInjuriesCausedToplist(deps.teams, eraId),
            },
            suffered: {
              supportsEra: true,
              resolve: (eraId) =>
                resolveTeamSeriousInjuriesSufferedToplist(deps.teams, eraId),
            },
          },
          lasting: {
            suffered: {
              supportsEra: true,
              resolve: (eraId) =>
                resolveTeamLastingInjuriesSufferedToplist(deps.teams, eraId),
            },
          },
        },
        deaths: {
          caused: {
            supportsEra: true,
            resolve: (eraId) =>
              resolveTeamDeathsCausedToplist(deps.teams, eraId),
          },
          suffered: {
            supportsEra: true,
            resolve: (eraId) =>
              resolveTeamDeathsSufferedToplist(deps.teams, eraId),
          },
        },
        fouls: {
          committed: {
            supportsEra: true,
            resolve: (eraId) =>
              resolveTeamFoulsCommittedToplist(deps.teams, eraId),
          },
        },
        sent_off: {
          supportsEra: true,
          resolve: (eraId) => resolveTeamTimesSentOffToplist(deps.teams, eraId),
        },
      },
    },
    player: {
      toplist: {
        mvps: {
          supportsEra: true,
          resolve: (eraId) => resolvePlayerMvpsToplist(deps.players, eraId),
        },
        touchdowns: {
          scored: {
            supportsEra: true,
            resolve: (eraId) =>
              resolvePlayerTouchdownsScoredToplist(deps.players, eraId),
          },
        },
        completions: {
          supportsEra: true,
          resolve: (eraId) =>
            resolvePlayerCompletionsToplist(deps.players, eraId),
        },
        interceptions: {
          supportsEra: true,
          resolve: (eraId) =>
            resolvePlayerInterceptionsToplist(deps.players, eraId),
        },
        deflections: {
          supportsEra: true,
          resolve: (eraId) =>
            resolvePlayerDeflectionsToplist(deps.players, eraId),
        },
        casualties: {
          caused: {
            supportsEra: true,
            resolve: (eraId) =>
              resolvePlayerCasualtiesCausedToplist(deps.players, eraId),
          },
          suffered: {
            supportsEra: true,
            resolve: (eraId) =>
              resolvePlayerCasualtiesSufferedToplist(deps.players, eraId),
          },
        },
        injuries: {
          serious: {
            caused: {
              supportsEra: true,
              resolve: (eraId) =>
                resolvePlayerSeriousInjuriesCausedToplist(deps.players, eraId),
            },
            suffered: {
              supportsEra: true,
              resolve: (eraId) =>
                resolvePlayerSeriousInjuriesSufferedToplist(
                  deps.players,
                  eraId,
                ),
            },
          },
          lasting: {
            suffered: {
              supportsEra: true,
              resolve: (eraId) =>
                resolvePlayerLastingInjuriesSufferedToplist(
                  deps.players,
                  eraId,
                ),
            },
          },
        },
        deaths: {
          caused: {
            supportsEra: true,
            resolve: (eraId) =>
              resolvePlayerDeathsCausedToplist(deps.players, eraId),
          },
        },
        fouls: {
          committed: {
            supportsEra: true,
            resolve: (eraId) =>
              resolvePlayerFoulsCommittedToplist(deps.players, eraId),
          },
        },
        sent_off: {
          supportsEra: true,
          resolve: (eraId) =>
            resolvePlayerTimesSentOffToplist(deps.players, eraId),
        },
      },
    },
    race: {
      toplist: {
        teams: {
          supportsEra: true,
          resolve: (eraId) => resolveRaceTeamsToplist(deps.races, eraId),
        },
        matches: {
          played: {
            supportsEra: true,
            resolve: (eraId) =>
              resolveRaceMatchesPlayedToplist(deps.races, eraId),
          },
        },
      },
    },
    eras: {
      list: {
        supportsEra: false,
        resolve: () => resolveErasList(deps.eras),
      },
    },
    stats: {
      supportsEra: true,
      resolve: (eraId) => resolveStatsSummary(deps, eraId),
    },
  };
}
