import type { TeamsService } from '@blood-bowl-tracker/game-data';
import type { InteractionReplyOptions } from 'discord.js';

import { withDatabaseTimeout } from '../../database-timeout';
import {
  DEEPDIVE_TEAM_CAREER_TIMEOUT_MESSAGE,
  DEEPDIVE_TEAM_NO_MATCHES_MESSAGE,
  DEEPDIVE_TEAM_NOT_FOUND_MESSAGE,
  DEEPDIVE_TEAM_PLAYERS_TIMEOUT_MESSAGE,
  DEEPDIVE_TEAM_TIMEOUT_MESSAGE,
} from '../../error-messages';
import {
  buildEntityButtons,
  MAX_LEADERBOARD_ENTRIES,
  topRanksWithTies,
} from '../../insights/leaderboard';
import {
  COACH_BUTTON_CUSTOM_ID_PREFIX,
  PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  RACE_BUTTON_CUSTOM_ID_PREFIX,
} from '../button-custom-ids';

type Team = {
  id: number;
  name: string;
  raceName: string;
  raceId: number;
  coachName: string;
  coachId: number;
};
type CareerSpan = { start: string; end: string };
type TopPlayer = { playerId: number; name: string; count: number };
type ButtonEntry = { customId: string; label: string };

/** Position at which the top-players list opens a tie group (5th place). */
const TOP_PLAYERS_TOP_ENTRIES = 5;

/**
 * Composes the team header (race + coach), career span, and top-players list
 * into a single embed. Shared by `/deepdive team:<id>` and the team deepdive
 * buttons. Each DB call is wrapped in `withDatabaseTimeout` with a `null`
 * sentinel so a timeout is distinguishable from a genuine "not found" / "no
 * matches" (`undefined`).
 */
export async function resolveTeamDeepdive(
  teamId: number,
  services: { teams: TeamsService },
): Promise<string | InteractionReplyOptions> {
  const { teams } = services;

  const team: Team | undefined | null = await withDatabaseTimeout(
    teams.findById(teamId),
    null,
  );
  if (team === null) {
    return DEEPDIVE_TEAM_TIMEOUT_MESSAGE;
  }
  if (team === undefined) {
    return DEEPDIVE_TEAM_NOT_FOUND_MESSAGE;
  }

  const header = [`Race: ${team.raceName}`, `Coach: ${team.coachName}`];
  const headerButtonEntries: ButtonEntry[] = [
    {
      customId: `${RACE_BUTTON_CUSTOM_ID_PREFIX}${team.raceId}`,
      label: team.raceName,
    },
    {
      customId: `${COACH_BUTTON_CUSTOM_ID_PREFIX}${team.coachId}`,
      label: team.coachName,
    },
  ];

  const span: CareerSpan | undefined | null = await withDatabaseTimeout(
    teams.getCareerSpan(teamId),
    null,
  );
  if (span === null) {
    return DEEPDIVE_TEAM_CAREER_TIMEOUT_MESSAGE;
  }
  if (span === undefined) {
    return {
      embeds: [
        {
          title: team.name,
          description: [...header, DEEPDIVE_TEAM_NO_MATCHES_MESSAGE].join('\n'),
        },
      ],
      components: buildEntityButtons(
        headerButtonEntries,
        (entry) => entry.customId,
        (entry) => entry.label,
      ),
    };
  }

  const topPlayers: TopPlayer[] | null = await withDatabaseTimeout(
    teams.getTopPlayersByMatchEventCount(teamId, MAX_LEADERBOARD_ENTRIES),
    null,
  );
  if (topPlayers === null) {
    return DEEPDIVE_TEAM_PLAYERS_TIMEOUT_MESSAGE;
  }

  const { rows: ranked, truncatedCount } = topRanksWithTies(
    topPlayers,
    TOP_PLAYERS_TOP_ENTRIES,
  );
  const playerLines = ranked.map(
    (row) => `${row.rank}. ${row.name} — ${row.count}`,
  );
  if (truncatedCount > 0) {
    playerLines.push(`…and ${truncatedCount} more tied.`);
  }

  const description = [
    ...header,
    `Career: ${span.start} – ${span.end}`,
    '',
    'Top players by match events:',
    ...playerLines,
  ].join('\n');

  const buttonEntries: ButtonEntry[] = [
    ...headerButtonEntries,
    ...ranked.map((row) => ({
      customId: `${PLAYER_BUTTON_CUSTOM_ID_PREFIX}${row.playerId}`,
      label: row.name,
    })),
  ];
  const components = buildEntityButtons(
    buttonEntries,
    (entry) => entry.customId,
    (entry) => entry.label,
  );

  return {
    embeds: [{ title: team.name, description }],
    components,
  };
}
