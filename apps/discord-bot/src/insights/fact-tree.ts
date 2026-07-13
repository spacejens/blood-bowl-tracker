import type { FactNode } from './fact-tree-utils';
import {
  resolveCoachMatchesPlayedToplist,
  resolveCoachTeamsToplist,
} from './facts/coach-toplist';
import type { StatsSummaryDeps } from './facts/stats-summary';
import { resolveStatsSummary } from './facts/stats-summary';
import { resolveTeamMatchesPlayedToplist } from './facts/team-toplist';

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
      },
    },
    stats: {
      supportsEra: false,
      resolve: (eraId) => resolveStatsSummary(deps, eraId),
    },
  };
}
