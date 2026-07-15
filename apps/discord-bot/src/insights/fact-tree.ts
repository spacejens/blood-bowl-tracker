import type { FactNode } from './fact-tree-utils';
import {
  resolveCoachCompetitionsPlayedToplist,
  resolveCoachErasActiveToplist,
  resolveCoachMatchesPlayedToplist,
  resolveCoachTeamsToplist,
} from './facts/coach-toplist';
import { resolveErasList } from './facts/eras-list';
import { resolvePlayerMvpsToplist } from './facts/player-toplist';
import {
  resolveRaceMatchesPlayedToplist,
  resolveRaceTeamsToplist,
} from './facts/race-toplist';
import type { StatsSummaryDeps } from './facts/stats-summary';
import { resolveStatsSummary } from './facts/stats-summary';
import {
  resolveTeamCompetitionsPlayedToplist,
  resolveTeamErasActiveToplist,
  resolveTeamMatchesPlayedToplist,
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
      },
    },
    player: {
      toplist: {
        mvps: {
          supportsEra: true,
          resolve: (eraId) => resolvePlayerMvpsToplist(deps.players, eraId),
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
