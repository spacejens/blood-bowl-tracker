import type { PlayersService } from '@blood-bowl-tracker/game-data';
import type { InteractionReplyOptions } from 'discord.js';

import { withDatabaseTimeout } from '../../database-timeout';
import {
  DEEPDIVE_PLAYER_COUNTS_TIMEOUT_MESSAGE,
  DEEPDIVE_PLAYER_NO_EVENTS_MESSAGE,
  DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE,
  DEEPDIVE_PLAYER_TIMEOUT_MESSAGE,
} from '../../error-messages';
import { buildEntityButtons } from '../../insights/leaderboard';
import {
  RACE_BUTTON_CUSTOM_ID_PREFIX,
  TEAM_BUTTON_CUSTOM_ID_PREFIX,
} from '../button-custom-ids';

type Player = {
  id: number;
  name: string;
  teamName: string;
  teamId: number;
  raceName: string;
  raceId: number;
  positionName: string;
};
type CategoryCount = { label: string; count: number };

/**
 * Composes the player header (team, race, position) and per-category event
 * counts into a single embed. Shared by `/deepdive player:<id>` and the player
 * deepdive buttons. Each DB call is wrapped in `withDatabaseTimeout` with a
 * `null` sentinel so a timeout is distinguishable from a genuine "not found"
 * (`undefined`). Only non-zero categories are listed; an all-zero player shows
 * a short placeholder instead of an empty list.
 */
export async function resolvePlayerDeepdive(
  playerId: number,
  services: { players: PlayersService },
): Promise<string | InteractionReplyOptions> {
  const { players } = services;

  const player: Player | undefined | null = await withDatabaseTimeout(
    players.findById(playerId),
    null,
  );
  if (player === null) {
    return DEEPDIVE_PLAYER_TIMEOUT_MESSAGE;
  }
  if (player === undefined) {
    return DEEPDIVE_PLAYER_NOT_FOUND_MESSAGE;
  }

  const header = [
    `Team: ${player.teamName}`,
    `Race: ${player.raceName}`,
    `Position: ${player.positionName}`,
  ];

  const counts: CategoryCount[] | null = await withDatabaseTimeout(
    players.getDeepdiveCategoryCounts(playerId),
    null,
  );
  if (counts === null) {
    return DEEPDIVE_PLAYER_COUNTS_TIMEOUT_MESSAGE;
  }

  const nonZero = counts.filter((category) => category.count > 0);
  const categoryLines =
    nonZero.length === 0
      ? [DEEPDIVE_PLAYER_NO_EVENTS_MESSAGE]
      : nonZero.map((category) => `${category.label}: ${category.count}`);

  const description = [...header, '', ...categoryLines].join('\n');

  const components = buildEntityButtons(
    [
      {
        customId: `${TEAM_BUTTON_CUSTOM_ID_PREFIX}${player.teamId}`,
        label: player.teamName,
      },
      {
        customId: `${RACE_BUTTON_CUSTOM_ID_PREFIX}${player.raceId}`,
        label: player.raceName,
      },
    ],
    (entry) => entry.customId,
    (entry) => entry.label,
  );

  return { embeds: [{ title: player.name, description }], components };
}
