import { Injectable } from '@nestjs/common';

import type { EntityComponentEntry } from '../entity-components.service';
import {
  PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX,
} from './button-custom-ids';

/**
 * One listed player row, with everything needed to decide where its
 * drill-down button should point. Every producing query
 * (`countAllMatchEventsByPlayerForTeam`, `TrophyAwardsService.listByTeam`,
 * `TrophyAwardsService.listRecipients`, `TrophyAwardsService.listForCompetition`,
 * `PlayerDeathService.findPlayerSummary`) selects these columns, so no caller
 * needs a per-row star lookup.
 */
export interface PlayerRow {
  playerId: number;
  playerName: string;
  positionId: number;
  positionName: string;
  isStarPlayer: boolean;
}

/**
 * Decides which deepdive a listed player row's drill-down button opens.
 *
 * A star player's identity is its *position*, not the per-team `players` row
 * recording one hire of it, so a star row must open the star player deepdive
 * (`deepdive:star-player:<positions.id>`) — which shows every team that has
 * hired them — rather than the per-team player deepdive, which would show a
 * single hire in isolation. Every other row keeps its existing per-team
 * player button.
 *
 * Its own service rather than a conditional repeated at each of the six call
 * sites (the team deepdive's top players and honors, the killer/victim
 * entries in the player deepdive's kills section, the trophy deepdive's
 * recipient button, and the competition deepdive's award button), so the rule
 * and the label choice live in exactly one place. Pure and dependency-free: it
 * performs no I/O and injects nothing, matching this repo's convention that
 * pure transformation logic is still a service.
 */
@Injectable()
export class PlayerRowButtonService {
  /**
   * The star button is labelled with the *position* name — the star's own
   * name — while a regular row keeps the player's name, so the label always
   * names the entity the button actually opens.
   */
  buildPlayerRowButton(row: PlayerRow): EntityComponentEntry {
    return row.isStarPlayer
      ? {
          customIdPrefix: STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX,
          entityId: String(row.positionId),
          label: row.positionName,
        }
      : {
          customIdPrefix: PLAYER_BUTTON_CUSTOM_ID_PREFIX,
          entityId: String(row.playerId),
          label: row.playerName,
        };
  }
}
