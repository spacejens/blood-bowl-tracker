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
          played: () => resolveCoachMatchesPlayedToplist(deps.coaches),
        },
        teams: () => resolveCoachTeamsToplist(deps.coaches),
      },
    },
    team: {
      toplist: {
        matches: {
          played: () => resolveTeamMatchesPlayedToplist(deps.teams),
        },
      },
    },
    stats: () => resolveStatsSummary(deps),
  };
}
