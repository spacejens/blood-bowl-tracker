import type { FactNode } from './fact-tree-utils';
import {
  resolveCoachMatchesPlayedToplist,
  resolveCoachTeamsToplist,
} from './facts/coach-toplist';
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
    stats: {
      supportsEra: false,
      resolve: (eraId) => resolveStatsSummary(deps, eraId),
    },
  };
}
