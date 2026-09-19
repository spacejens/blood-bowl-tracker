import { Injectable } from '@nestjs/common';

/** A star player's own exclusive skill. */
export const UNIQUE_SKILL_MARKER = '★';

/** A gained skill that was randomly rolled rather than freely chosen. */
export const RANDOM_SKILL_MARKER = '⚄';

/** BB2025's orthogonal "elite" marker on a gained skill. */
export const ELITE_SKILL_MARKER = '◆';

/**
 * One skill to render. `attributeValue` is the variant that is not part of
 * the skill's own identity (Loner's roll number, Hatred's target race).
 *
 * `isUnique` is only ever true for a STARTING skill — a star player's own
 * exclusive skill (`skill_rules_sets.category === 'unique'`). `isRandom` and
 * `isElite` are only ever true for a GAINED skill; a starting-skill caller
 * never passes them as true, even where the same skill is elite-flagged under
 * that rules set.
 */
export interface SkillFormatInput {
  name: string;
  attributeValue?: string | null;
  isUnique?: boolean;
  isRandom?: boolean;
  isElite?: boolean;
}

/**
 * Renders one skill the way every review report shows it: markers first, then
 * the name, then the attribute value in parentheses — `Loner (4+)`,
 * `★ Mighty Blow (Grombrindal)`, `⚄ ◆ Break Tackle`.
 *
 * This mirrors the convention `apps/discord-bot`'s `PositionStatLineService`
 * uses, but is implemented independently here: the review tools must not
 * depend on the bot or on `packages/game-data`.
 *
 * Pure and dependency-free, so specs inject it real.
 */
@Injectable()
export class SkillFormatService {
  format(input: SkillFormatInput): string {
    return `${this.markers(input)}${input.name}${this.attribute(input)}`;
  }

  /** The marker prefix, including its trailing space, or an empty string. */
  private markers(input: SkillFormatInput): string {
    if (input.isUnique === true) {
      return `${UNIQUE_SKILL_MARKER} `;
    }
    const markers: string[] = [];
    if (input.isRandom === true) {
      markers.push(RANDOM_SKILL_MARKER);
    }
    if (input.isElite === true) {
      markers.push(ELITE_SKILL_MARKER);
    }
    return markers.length === 0 ? '' : `${markers.join(' ')} `;
  }

  private attribute(input: SkillFormatInput): string {
    const value = input.attributeValue;
    return value === undefined || value === null || value === ''
      ? ''
      : ` (${value})`;
  }
}
