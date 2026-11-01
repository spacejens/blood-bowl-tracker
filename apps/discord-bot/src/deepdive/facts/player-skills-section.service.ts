import { PLAYER_CHARACTERISTICS } from '@blood-bowl-tracker/domain-enums';
import type {
  PlayerCharacteristicAdvancementRow,
  PlayerSkillRow,
} from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';

import { UNIQUE_SKILL_MARKER } from './skill-markers';

/**
 * Prefixed to a skill the coach did not choose but rolled for. Only `random`
 * earns it: `advancement` means the source recorded that the skill was gained
 * without saying how, which is not the same as knowing it was rolled. Where
 * that unknown matters it gets `UNKNOWN_SOURCE_SKILL_MARKER` instead.
 */
const RANDOM_SKILL_MARKER = '⚄ ';

/**
 * Prefixed to a gained skill whose source is `advancement`, meaning nobody
 * knows whether it was rolled or chosen, in an era that prices advancements
 * by kind. There a rolled skill and a chosen one cost different amounts, so
 * leaving the skill unmarked would let it read as chosen. In a fixed-threshold
 * era every advancement costs the same and the unknown changes nothing, so it
 * stays unmarked. A free extra cost nothing either way and keeps only its
 * cross. Takes the dice's slot and never appears with it. A plain Unicode
 * symbol rather than an emoji, matching every other marker in these embeds.
 */
const UNKNOWN_SOURCE_SKILL_MARKER = '⚄? ';

/**
 * Prefixed to a free extra: a gained skill that cost no SPP and is not one of
 * the player's advancements (BB2025's Hatred, a trophy-granted mutation). Only
 * ever on a gained skill — a starting skill was never gained, so marking one
 * would read as a claim about how the player came by it. A plain Unicode
 * symbol rather than an emoji, matching every other marker in these embeds.
 */
const FREE_EXTRA_SKILL_MARKER = '✚ ';

/**
 * Prefixed to an elite skill, and only ever on a gained skill. Elite status
 * marks a skill that costs more player value to pick during advancement — it
 * is not a restriction on which skills can be picked. A starting skill was
 * never picked at that cost, so marking one would read as a claim about how
 * the player came by it. A plain Unicode symbol rather than an emoji, matching
 * every other marker in these embeds.
 */
const ELITE_SKILL_MARKER = '♦ ';

/** What the caller knows about the player's era that changes how skills read. */
export interface PlayerSkillLineOptions {
  /**
   * True when the player's era prices advancements by kind (BB2020, DB2021,
   * BB2025), where a gained skill of unknown source is worth flagging.
   */
  pricesByKind: boolean;
  /**
   * The player's characteristic increases, merged into the Advancements line
   * among the gained skills. Absent means none.
   */
  characteristicAdvancements?: PlayerCharacteristicAdvancementRow[];
}

/** One entry of the Advancements line, before it is joined. */
interface AdvancementItem {
  order: number | null;
  /** 0 for a skill, 1 for an increase: skills come first among equals. */
  kind: 0 | 1;
  /** The skill name, or the characteristic's stat-line index. */
  tieBreak: string | number;
  text: string;
}

/** No era knowledge: nothing is flagged as of unknown source. */
const DEFAULT_OPTIONS: PlayerSkillLineOptions = { pricesByKind: false };

/**
 * The two skill lines of the player deepdive: the starting skills, then every
 * advancement (gained skills and characteristic increases) in the order the
 * player gained them; an increase reads `+AG`. They are kept visibly apart
 * because the distinction is the interesting one — everybody in a position
 * starts with the same skills, and only the advancements say anything about
 * this player's career.
 *
 * A group with no skills contributes no line at all, matching how this embed
 * already handles an absent lasting injury: a "none" line on the many players
 * who have gained nothing would be noise.
 *
 * A gained skill of unknown source (`advancement`) is flagged only when the
 * caller says the era prices advancements by kind: only there does not
 * knowing whether it was rolled or chosen leave its cost open.
 *
 * Pure text assembly, with no I/O, no dependencies and no external state.
 */
@Injectable()
export class PlayerSkillsSectionService {
  /**
   * Zero, one or two lines, starting skills first. `rows` may arrive in any
   * order; each group is sorted here so the caller never has to care.
   */
  build(
    rows: PlayerSkillRow[],
    options: PlayerSkillLineOptions = DEFAULT_OPTIONS,
  ): string[] {
    const starting = rows.filter((row) => row.source === 'starting');
    const gained = rows.filter((row) => row.source !== 'starting');
    const items: AdvancementItem[] = [
      ...gained.map((row): AdvancementItem => ({
        order: row.advancementOrder,
        kind: 0,
        tieBreak: row.skillName,
        text: this.formatSkill(row, options),
      })),
      ...(options.characteristicAdvancements ?? []).map(
        (row): AdvancementItem => ({
          order: row.advancementOrder,
          kind: 1,
          tieBreak: PLAYER_CHARACTERISTICS.indexOf(row.characteristic),
          text: `+${row.characteristic}`,
        }),
      ),
    ];
    return [
      ...this.buildLine(
        'Starting skills',
        this.sortStarting(starting).map((row) =>
          this.formatSkill(row, options),
        ),
      ),
      ...this.buildLine(
        'Advancements',
        this.sortAdvancements(items).map((item) => item.text),
      ),
    ];
  }

  /** One labelled, comma-joined line, or nothing at all for an empty group. */
  private buildLine(label: string, formatted: string[]): string[] {
    return formatted.length === 0 ? [] : [`${label}: ${formatted.join(', ')}`];
  }

  /**
   * Alphabetical: a position grants every starting skill at once, so there is
   * no sequence among them to preserve.
   */
  private sortStarting(rows: PlayerSkillRow[]): PlayerSkillRow[] {
    return [...rows].sort((a, b) => a.skillName.localeCompare(b.skillName));
  }

  /**
   * In the order the player gained them. An entry with no recorded order is an
   * unknown, not an earliest, so it sorts last: skills alphabetically, then
   * increases in stat-line order.
   */
  private sortAdvancements(items: AdvancementItem[]): AdvancementItem[] {
    return [...items].sort((a, b) => {
      const left = a.order ?? Number.MAX_SAFE_INTEGER;
      const right = b.order ?? Number.MAX_SAFE_INTEGER;
      if (left !== right) {
        return left - right;
      }
      if (a.kind !== b.kind) {
        return a.kind - b.kind;
      }
      return typeof a.tieBreak === 'number' && typeof b.tieBreak === 'number'
        ? a.tieBreak - b.tieBreak
        : String(a.tieBreak).localeCompare(String(b.tieBreak));
    });
  }

  /**
   * `Block`, `Loner (4+)`, `⚄ Guard`, `⚄? Guard`, `✚ Hatred (Undead)`,
   * `★ Treacherous`, or `⚄ ♦ Mighty Blow`.
   *
   * The star marks a skill's `unique` category under the rules set, mirroring
   * the position stat line, so it applies to starting and gained skills alike
   * -- it says what the skill is, not how the player came by it. A skill with
   * no curated category there gets no star. Markers read dice, cross, star,
   * gem; a unique skill is never elite in curated data, so that last pairing
   * is only a deterministic tie-break.
   */
  private formatSkill(
    row: PlayerSkillRow,
    options: PlayerSkillLineOptions,
  ): string {
    const gained = row.source !== 'starting';
    const dice = this.diceMarker(row, options);
    const cross = gained && row.isFreeExtra ? FREE_EXTRA_SKILL_MARKER : '';
    const star = row.category === 'unique' ? UNIQUE_SKILL_MARKER : '';
    const gem = gained && row.isElite ? ELITE_SKILL_MARKER : '';
    const attribute =
      row.attributeValue === null ? '' : ` (${row.attributeValue})`;
    return `${dice}${cross}${star}${gem}${row.skillName}${attribute}`;
  }

  /**
   * The dice slot: rolled, of unknown source where that matters, or nothing.
   * `advancement` is never `starting`, so a starting skill never gets either.
   */
  private diceMarker(
    row: PlayerSkillRow,
    options: PlayerSkillLineOptions,
  ): string {
    if (row.source === 'random') {
      return RANDOM_SKILL_MARKER;
    }
    const unknownSource =
      options.pricesByKind && row.source === 'advancement' && !row.isFreeExtra;
    return unknownSource ? UNKNOWN_SOURCE_SKILL_MARKER : '';
  }
}
