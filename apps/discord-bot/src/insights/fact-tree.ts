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
            supportsCompetition: false,
            resolve: (eraId) =>
              resolveCoachMatchesPlayedToplist(deps.coaches, eraId),
          },
        },
        teams: {
          supportsEra: true,
          supportsCompetition: false,
          resolve: (eraId) => resolveCoachTeamsToplist(deps.coaches, eraId),
        },
        competitions: {
          played: {
            supportsEra: true,
            supportsCompetition: false,
            resolve: (eraId) =>
              resolveCoachCompetitionsPlayedToplist(deps.coaches, eraId),
          },
        },
        eras: {
          active: {
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
            supportsEra: true,
            supportsCompetition: true,
            resolve: (eraId, competitionId) =>
              resolveTeamMatchesPlayedToplist(deps.teams, eraId, competitionId),
          },
        },
        competitions: {
          played: {
            supportsEra: true,
            supportsCompetition: true,
            resolve: (eraId, competitionId) =>
              resolveTeamCompetitionsPlayedToplist(
                deps.teams,
                eraId,
                competitionId,
              ),
          },
        },
        eras: {
          active: {
            supportsEra: false,
            supportsCompetition: false,
            resolve: () => resolveTeamErasActiveToplist(deps.teams),
          },
        },
        touchdowns: {
          scored: {
            supportsEra: true,
            supportsCompetition: true,
            resolve: (eraId, competitionId) =>
              resolveTeamTouchdownsScoredToplist(
                deps.teams,
                eraId,
                competitionId,
              ),
          },
        },
        completions: {
          supportsEra: true,
          supportsCompetition: true,
          resolve: (eraId, competitionId) =>
            resolveTeamCompletionsToplist(deps.teams, eraId, competitionId),
        },
        interceptions: {
          supportsEra: true,
          supportsCompetition: true,
          resolve: (eraId, competitionId) =>
            resolveTeamInterceptionsToplist(deps.teams, eraId, competitionId),
        },
        deflections: {
          supportsEra: true,
          supportsCompetition: true,
          resolve: (eraId, competitionId) =>
            resolveTeamDeflectionsToplist(deps.teams, eraId, competitionId),
        },
        casualties: {
          caused: {
            supportsEra: true,
            supportsCompetition: true,
            resolve: (eraId, competitionId) =>
              resolveTeamCasualtiesCausedToplist(
                deps.teams,
                eraId,
                competitionId,
              ),
          },
          suffered: {
            supportsEra: true,
            supportsCompetition: true,
            resolve: (eraId, competitionId) =>
              resolveTeamCasualtiesSufferedToplist(
                deps.teams,
                eraId,
                competitionId,
              ),
          },
        },
        injuries: {
          serious: {
            caused: {
              supportsEra: true,
              supportsCompetition: true,
              resolve: (eraId, competitionId) =>
                resolveTeamSeriousInjuriesCausedToplist(
                  deps.teams,
                  eraId,
                  competitionId,
                ),
            },
            suffered: {
              supportsEra: true,
              supportsCompetition: true,
              resolve: (eraId, competitionId) =>
                resolveTeamSeriousInjuriesSufferedToplist(
                  deps.teams,
                  eraId,
                  competitionId,
                ),
            },
          },
          lasting: {
            suffered: {
              supportsEra: true,
              supportsCompetition: true,
              resolve: (eraId, competitionId) =>
                resolveTeamLastingInjuriesSufferedToplist(
                  deps.teams,
                  eraId,
                  competitionId,
                ),
            },
          },
        },
        deaths: {
          caused: {
            supportsEra: true,
            supportsCompetition: true,
            resolve: (eraId, competitionId) =>
              resolveTeamDeathsCausedToplist(deps.teams, eraId, competitionId),
          },
          suffered: {
            supportsEra: true,
            supportsCompetition: true,
            resolve: (eraId, competitionId) =>
              resolveTeamDeathsSufferedToplist(
                deps.teams,
                eraId,
                competitionId,
              ),
          },
        },
        fouls: {
          committed: {
            supportsEra: true,
            supportsCompetition: true,
            resolve: (eraId, competitionId) =>
              resolveTeamFoulsCommittedToplist(
                deps.teams,
                eraId,
                competitionId,
              ),
          },
        },
        sent_off: {
          supportsEra: true,
          supportsCompetition: true,
          resolve: (eraId, competitionId) =>
            resolveTeamTimesSentOffToplist(deps.teams, eraId, competitionId),
        },
      },
    },
    player: {
      toplist: {
        mvps: {
          supportsEra: true,
          supportsCompetition: true,
          resolve: (eraId, competitionId) =>
            resolvePlayerMvpsToplist(deps.players, eraId, competitionId),
        },
        touchdowns: {
          scored: {
            supportsEra: true,
            supportsCompetition: true,
            resolve: (eraId, competitionId) =>
              resolvePlayerTouchdownsScoredToplist(
                deps.players,
                eraId,
                competitionId,
              ),
          },
        },
        completions: {
          supportsEra: true,
          supportsCompetition: true,
          resolve: (eraId, competitionId) =>
            resolvePlayerCompletionsToplist(deps.players, eraId, competitionId),
        },
        interceptions: {
          supportsEra: true,
          supportsCompetition: true,
          resolve: (eraId, competitionId) =>
            resolvePlayerInterceptionsToplist(
              deps.players,
              eraId,
              competitionId,
            ),
        },
        deflections: {
          supportsEra: true,
          supportsCompetition: true,
          resolve: (eraId, competitionId) =>
            resolvePlayerDeflectionsToplist(deps.players, eraId, competitionId),
        },
        casualties: {
          caused: {
            supportsEra: true,
            supportsCompetition: true,
            resolve: (eraId, competitionId) =>
              resolvePlayerCasualtiesCausedToplist(
                deps.players,
                eraId,
                competitionId,
              ),
          },
          suffered: {
            supportsEra: true,
            supportsCompetition: true,
            resolve: (eraId, competitionId) =>
              resolvePlayerCasualtiesSufferedToplist(
                deps.players,
                eraId,
                competitionId,
              ),
          },
        },
        injuries: {
          serious: {
            caused: {
              supportsEra: true,
              supportsCompetition: true,
              resolve: (eraId, competitionId) =>
                resolvePlayerSeriousInjuriesCausedToplist(
                  deps.players,
                  eraId,
                  competitionId,
                ),
            },
            suffered: {
              supportsEra: true,
              supportsCompetition: true,
              resolve: (eraId, competitionId) =>
                resolvePlayerSeriousInjuriesSufferedToplist(
                  deps.players,
                  eraId,
                  competitionId,
                ),
            },
          },
          lasting: {
            suffered: {
              supportsEra: true,
              supportsCompetition: true,
              resolve: (eraId, competitionId) =>
                resolvePlayerLastingInjuriesSufferedToplist(
                  deps.players,
                  eraId,
                  competitionId,
                ),
            },
          },
        },
        deaths: {
          caused: {
            supportsEra: true,
            supportsCompetition: true,
            resolve: (eraId, competitionId) =>
              resolvePlayerDeathsCausedToplist(
                deps.players,
                eraId,
                competitionId,
              ),
          },
        },
        fouls: {
          committed: {
            supportsEra: true,
            supportsCompetition: true,
            resolve: (eraId, competitionId) =>
              resolvePlayerFoulsCommittedToplist(
                deps.players,
                eraId,
                competitionId,
              ),
          },
        },
        sent_off: {
          supportsEra: true,
          supportsCompetition: true,
          resolve: (eraId, competitionId) =>
            resolvePlayerTimesSentOffToplist(
              deps.players,
              eraId,
              competitionId,
            ),
        },
      },
    },
    race: {
      toplist: {
        teams: {
          supportsEra: true,
          supportsCompetition: false,
          resolve: (eraId) => resolveRaceTeamsToplist(deps.races, eraId),
        },
        matches: {
          played: {
            supportsEra: true,
            supportsCompetition: false,
            resolve: (eraId) =>
              resolveRaceMatchesPlayedToplist(deps.races, eraId),
          },
        },
      },
    },
    eras: {
      list: {
        supportsEra: false,
        supportsCompetition: false,
        resolve: () => resolveErasList(deps.eras),
      },
    },
    stats: {
      supportsEra: true,
      supportsCompetition: true,
      resolve: (eraId, competitionId) =>
        resolveStatsSummary(deps, eraId, competitionId),
    },
  };
}
