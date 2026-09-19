import type { PlayerSkillRow } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';

/**
 * Prefixed to a skill the coach did not choose but rolled for. Only `random`
 * earns it: `advancement` means the source recorded that the skill was gained
 * without saying how, which is not the same as knowing it was rolled.
 */
const RANDOM_SKILL_MARKER = '⚄ ';

/**
 * Prefixed to an elite skill, and only ever on a gained skill. Elite status
 * marks a skill that costs more player value to pick during advancement — it
 * is not a restriction on which skills can be picked. A starting skill was
 * never picked at that cost, so marking one would read as a claim about how
 * the player came by it. A plain Unicode symbol rather than an emoji, matching
 * every other marker in these embeds.
 */
const ELITE_SKILL_MARKER = '♦ ';

/**
 * The two skill lines of the player deepdive: what the player started with and
 * what they have gained since, kept visibly apart because the distinction is
 * the interesting one — everybody in a position starts with the same skills,
 * and only the gained ones say anything about this player's career.
 *
 * A group with no skills contributes no line at all, matching how this embed
 * already handles an absent lasting injury: a "none" line on the many players
 * who have gained nothing would be noise.
 *
 * Pure text assembly, with no I/O, no dependencies and no external state.
 */
@Injectable()
export class PlayerSkillsSectionService {
  /**
   * Zero, one or two lines, starting skills first. `rows` may arrive in any
   * order; each group is sorted here so the caller never has to care.
   */
  build(rows: PlayerSkillRow[]): string[] {
    const starting = rows.filter((row) => row.source === 'starting');
    const gained = rows.filter((row) => row.source !== 'starting');
    return [
      ...this.buildLine('Starting skills', this.sortStarting(starting)),
      ...this.buildLine('Gained skills', this.sortGained(gained)),
    ];
  }

  /** One labelled, comma-joined line, or nothing at all for an empty group. */
  private buildLine(label: string, rows: PlayerSkillRow[]): string[] {
    if (rows.length === 0) {
      return [];
    }
    const formatted = rows.map((row) => this.formatSkill(row)).join(', ');
    return [`${label}: ${formatted}`];
  }

  /**
   * Alphabetical: a position grants every starting skill at once, so there is
   * no sequence among them to preserve.
   */
  private sortStarting(rows: PlayerSkillRow[]): PlayerSkillRow[] {
    return [...rows].sort((a, b) => a.skillName.localeCompare(b.skillName));
  }

  /**
   * In the order the player gained them, which is the whole point of recording
   * `advancementOrder`. A row whose source never reported an order sorts last
   * rather than first — it is an unknown, not an earliest — and ties break
   * alphabetically so the line is stable across calls.
   */
  private sortGained(rows: PlayerSkillRow[]): PlayerSkillRow[] {
    return [...rows].sort((a, b) => {
      const left = a.advancementOrder ?? Number.MAX_SAFE_INTEGER;
      const right = b.advancementOrder ?? Number.MAX_SAFE_INTEGER;
      return left === right
        ? a.skillName.localeCompare(b.skillName)
        : left - right;
    });
  }

  /** `Block`, `Loner (4+)`, `⚄ Guard`, or `⚄ ♦ Mighty Blow`. */
  private formatSkill(row: PlayerSkillRow): string {
    const dice = row.source === 'random' ? RANDOM_SKILL_MARKER : '';
    const gem =
      row.source !== 'starting' && row.isElite ? ELITE_SKILL_MARKER : '';
    const attribute =
      row.attributeValue === null ? '' : ` (${row.attributeValue})`;
    return `${dice}${gem}${row.skillName}${attribute}`;
  }
}
