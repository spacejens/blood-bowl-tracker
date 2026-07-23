import type { FactScope, TeamsService } from '@blood-bowl-tracker/game-data';
import type { InteractionReplyOptions } from 'discord.js';

import {
  TEAM_TOPLIST_NO_DATA_MESSAGE,
  TEAM_TOPLIST_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { resolveToplist } from '../leaderboard';
import { teamButtonId } from './team-toplist';

/** Money rendered with a thousands separator and a `gp` suffix, e.g. `150,000 gp`. */
function gp(amount: number): string {
  return `${amount.toLocaleString('en-US')} gp`;
}

/**
 * Two hand-written resolvers (rather than the uniform makeToplistResolvers
 * shape) because each needs a custom `formatRow`: the totals list appends `gp`,
 * and the biggest-events list also appends the match date. Both rank in the
 * application layer via resolveToplist/topRanksWithTies.
 */
export async function resolveTeamExpensiveMistakesTotalToplist(
  teams: TeamsService,
  scope: FactScope,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist({
    title: 'Teams by money lost to expensive mistakes',
    fetchRows: (limit) => teams.sumExpensiveMistakesByTeam(scope, limit),
    timeoutMessage: TEAM_TOPLIST_TIMEOUT_MESSAGE,
    noDataMessage: TEAM_TOPLIST_NO_DATA_MESSAGE,
    buildCustomId: (row) => teamButtonId(row),
    formatRow: (row) => `${row.rank}. ${row.name} — ${gp(row.count)}`,
  });
}

export async function resolveTeamExpensiveMistakesBiggestToplist(
  teams: TeamsService,
  scope: FactScope,
): Promise<string | InteractionReplyOptions> {
  return resolveToplist({
    title: 'Biggest expensive mistakes',
    fetchRows: (limit) => teams.listBiggestExpensiveMistakes(scope, limit),
    timeoutMessage: TEAM_TOPLIST_TIMEOUT_MESSAGE,
    noDataMessage: TEAM_TOPLIST_NO_DATA_MESSAGE,
    buildCustomId: (row) => teamButtonId(row),
    formatRow: (row) =>
      `${row.rank}. ${row.name} — ${gp(row.count)} (${row.date})`,
  });
}
