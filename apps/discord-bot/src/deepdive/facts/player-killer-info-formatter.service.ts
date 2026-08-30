import type {
  PlayerKillerInfo,
  PlayerKillerTeam,
} from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';

import type { EntityComponentEntry } from '../../entity-components.service';
import { TEAM_BUTTON_CUSTOM_ID_PREFIX } from '../button-custom-ids';
import { PlayerRowButtonService } from '../player-row-button.service';

/**
 * Renders and links a `PlayerKillerInfo`, at whatever precision the data
 * supports. Extracted once three call sites needed the same four rules:
 * `PlayerKillsSectionService`'s victim rows, `PlayerDeepdiveService`'s
 * `Status:` line, and the on-this-date insight's kill rows.
 *
 * `describe` returns the phrase alone — "Griff Oberwald (...)", "An
 * unidentified player from ..." — with no lead-in and no foul note: each
 * caller prepends its own lead-in (`Killed by `, nothing, ...) and appends
 * its own foul note, since the foul note is orthogonal to the killer's
 * precision and reads differently depending on the caller (a kills row vs. a
 * `Status:` line).
 *
 * Pure apart from `PlayerRowButtonService` — itself a pure decision service —
 * so the chain stays pure end to end and may be passed real to a consumer's
 * spec under the documented `CLAUDE.md` carve-out for a pure formatting
 * service whose only collaborator is itself pure.
 */
@Injectable()
export class PlayerKillerInfoFormatterService {
  constructor(private readonly playerRowButton: PlayerRowButtonService) {}

  /** A team with the same `(race, coach)` context toplist rows use. */
  formatTeam(team: PlayerKillerTeam): string {
    return `${team.teamName} (${team.raceName}, ${team.coachName})`;
  }

  /**
   * A natural "or"-joined list: `X or Y` for two, and an Oxford comma before
   * the final `or` for three or more.
   */
  joinWithOr(parts: string[]): string {
    if (parts.length <= 2) {
      return parts.join(' or ');
    }
    return `${parts.slice(0, -1).join(', ')}, or ${parts[parts.length - 1]}`;
  }

  /** The killer/victim clause, at whatever precision `info` was resolved to. */
  describe(info: PlayerKillerInfo): string {
    switch (info.kind) {
      case 'player':
        return `${info.playerName} (${info.positionName}, ${info.teamName}, ${info.raceName}, ${info.coachName})`;
      case 'team':
        return `An unidentified player from ${this.formatTeam(info)}`;
      case 'ambiguousTeams':
        return `An unidentified player from ${this.joinWithOr(
          info.teams.map((team) => this.formatTeam(team)),
        )}`;
      case 'unknown':
        return 'An opponent, in mysterious circumstances';
    }
  }

  /**
   * Drill-down entries for `info`: the player, their team, or one entry per
   * candidate team when the side is ambiguous. Only the entity itself is
   * offered — never its position, race or coach.
   */
  buildEntries(info: PlayerKillerInfo): EntityComponentEntry[] {
    switch (info.kind) {
      case 'player':
        return [
          this.playerRowButton.buildPlayerRowButton({
            playerId: info.playerId,
            playerName: info.playerName,
            positionId: info.positionId,
            positionName: info.positionName,
            isStarPlayer: info.isStarPlayer,
          }),
        ];
      case 'team':
        return [
          {
            customIdPrefix: TEAM_BUTTON_CUSTOM_ID_PREFIX,
            entityId: String(info.teamId),
            label: info.teamName,
          },
        ];
      case 'ambiguousTeams':
        return info.teams.map((team) => ({
          customIdPrefix: TEAM_BUTTON_CUSTOM_ID_PREFIX,
          entityId: String(team.teamId),
          label: team.teamName,
        }));
      case 'unknown':
        return [];
    }
  }
}
