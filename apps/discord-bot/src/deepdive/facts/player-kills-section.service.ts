import type {
  PlayerKillEntry,
  PlayerKillerTeam,
} from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';

import {
  MAX_DESCRIPTION_LENGTH,
  OVERFLOW_NOTE_BUDGET,
} from '../../description-limits';
import type { EntityComponentEntry } from '../../entity-components.service';
import {
  PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  TEAM_BUTTON_CUSTOM_ID_PREFIX,
} from '../button-custom-ids';

export interface PlayerKillsSectionOptions {
  /** The fetched kills, newest match first, already capped by the caller. */
  kills: PlayerKillEntry[];
  /** The player's true kill count, so the overflow note is exact. */
  killsTotal: number;
  /** Every other line of the description, whose length is reserved first. */
  otherLines: string[];
}

export interface PlayerKillsSection {
  /** The blank separator, the `Kills:` heading and the rows — or nothing. */
  lines: string[];
  /** One drill-down entry per victim that made it into the text. */
  entries: EntityComponentEntry[];
}

/**
 * Builds the player deepdive's `Kills:` section: its lines and its drill-down
 * entries. Extracted from `PlayerDeepdiveService` purely for size — that file
 * is close to the repo's 500-line source ceiling — so this is a pure
 * formatting service with no injected dependencies and no I/O. It also owns
 * the two killer-text helpers (`formatTeam` and `joinWithOr`) that the
 * deepdive's own `Status:` line needs, so the same team rendering and the same
 * "or"-joining exist in exactly one place.
 */
@Injectable()
export class PlayerKillsSectionService {
  /**
   * Selects a prefix of `kills` that keeps the whole description within
   * Discord's `MAX_DESCRIPTION_LENGTH` and renders it, plus an exact overflow
   * note when anything was left out — whether beyond the caller's row cap or
   * beyond what fits by length. Kills are already newest-first, so trimming
   * from the end drops the oldest shown kills. Only rows that made it into the
   * text get a drill-down entry, so no button ever points at something the
   * reader cannot see explained.
   */
  build(options: PlayerKillsSectionOptions): PlayerKillsSection {
    const { kills, killsTotal, otherLines } = options;
    if (kills.length === 0) {
      return { lines: [], entries: [] };
    }

    const heading = ['', 'Kills:'];
    let budget =
      MAX_DESCRIPTION_LENGTH -
      otherLines.join('\n').length -
      heading.join('\n').length -
      1 - // the newline joining "Kills:" to the first kill row
      // Also reserved separately inside `buildHonorLines`
      // (player-deepdive.service.ts) for its own overflow note. When both
      // sections render on the same embed this budget is reserved twice —
      // deliberately: it's a safe, conservative overlap, not a bug to
      // collapse into one shared reservation.
      OVERFLOW_NOTE_BUDGET;

    const shown: PlayerKillEntry[] = [];
    for (const kill of kills) {
      const cost = this.formatKill(kill).length + 1;
      if (cost > budget) {
        break;
      }
      budget -= cost;
      shown.push(kill);
    }

    const lines = [...heading, ...shown.map((kill) => this.formatKill(kill))];
    // `killsTotal` is the real number of kills, so this remainder is exact.
    // Not gated on `shown.length > 0`: even when no row fits, the note is the
    // only thing that keeps the section from reading as "killed nobody".
    const truncatedCount = killsTotal - shown.length;
    if (truncatedCount > 0) {
      lines.push(`…and ${truncatedCount} more not shown.`);
    }
    return {
      lines,
      entries: shown.flatMap((kill) => this.buildVictimEntries(kill)),
    };
  }

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

  /** One kill's row, at whatever precision the victim was resolved to. */
  private formatKill(kill: PlayerKillEntry): string {
    const note = kill.viaFoul ? ' (via a foul)' : '';
    return `${this.formatVictim(kill)}${note}`;
  }

  /** The victim clause of a kill row, without the foul note. */
  private formatVictim(kill: PlayerKillEntry): string {
    switch (kill.kind) {
      case 'player':
        return `${kill.playerName} (${kill.positionName}, ${kill.teamName}, ${kill.raceName}, ${kill.coachName})`;
      case 'team':
        return `An unidentified player from ${this.formatTeam(kill)}`;
      case 'ambiguousTeams':
        return `An unidentified player from ${this.joinWithOr(
          kill.teams.map((team) => this.formatTeam(team)),
        )}`;
      case 'unknown':
        return 'An opponent, in mysterious circumstances';
      case 'prevented':
        return `An unidentified player from ${this.formatTeam(kill)}, saved by ${
          kill.avoidedBy === 'apothecary' ? 'an apothecary' : 'regeneration'
        }`;
    }
  }

  /**
   * Drill-down entries for one kill's victim: the victim player, their team,
   * or one entry per candidate team when the side is ambiguous. Only the
   * victim entity itself is offered — never its position, race or coach.
   */
  private buildVictimEntries(kill: PlayerKillEntry): EntityComponentEntry[] {
    switch (kill.kind) {
      case 'player':
        return [
          {
            customIdPrefix: PLAYER_BUTTON_CUSTOM_ID_PREFIX,
            entityId: String(kill.playerId),
            label: kill.playerName,
          },
        ];
      case 'team':
      case 'prevented':
        return [
          {
            customIdPrefix: TEAM_BUTTON_CUSTOM_ID_PREFIX,
            entityId: String(kill.teamId),
            label: kill.teamName,
          },
        ];
      case 'ambiguousTeams':
        return kill.teams.map((team) => ({
          customIdPrefix: TEAM_BUTTON_CUSTOM_ID_PREFIX,
          entityId: String(team.teamId),
          label: team.teamName,
        }));
      case 'unknown':
        return [];
    }
  }
}
