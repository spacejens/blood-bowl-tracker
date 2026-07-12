import type {
  CoachesService,
  TeamsService,
} from '@blood-bowl-tracker/game-data';

import type { FactNode } from './fact-tree-utils';
import {
  resolveCoachMatchesPlayedToplist,
  resolveCoachTeamsToplist,
} from './facts/coach-toplist';
import { resolveTeamMatchesPlayedToplist } from './facts/team-toplist';

export function buildFactTree(deps: {
  coaches: CoachesService;
  teams: TeamsService;
}): FactNode {
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
  };
}
