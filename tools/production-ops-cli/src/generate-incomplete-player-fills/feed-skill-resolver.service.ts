import type { PlayerCharacteristic } from '@blood-bowl-tracker/domain-enums';
import { Injectable } from '@nestjs/common';

import type { TpFeedHistoryReport } from '../read-tp-feed-history/tp-feed-history-index.service';
import type {
  CharacteristicKey,
  ResolvedStep,
  SkillNameRow,
} from './fill-plan.types';

export interface ResolveStepsInput {
  /** One player's reports, oldest first. */
  reports: readonly TpFeedHistoryReport[];
  skillNames: readonly SkillNameRow[];
}

/** `Mighty Blow (+1)` -> `Mighty Blow` and `+1`. */
const VARIANT = /^(.+?)\s*\(([^()]+)\)$/u;

const CHARACTERISTIC_KEYS_BY_NAME: Record<
  PlayerCharacteristic,
  CharacteristicKey
> = { MA: 'ma', ST: 'st', AG: 'ag', PA: 'pa', AV: 'av' };

interface NamedSkill {
  skillId: number;
  skillName: string;
  nameId: string;
  attributeValue: string | null;
}

type SkillLookup =
  | { found: 'none' }
  | { found: 'ambiguous' }
  | { found: 'one'; skill: Pick<NamedSkill, 'skillId' | 'skillName'> };

/**
 * Turns a player's feed reports into the steps pricing and the entry read.
 * A skill is the one stored skill whose `Name` id is the report's text, or
 * else, when no skill has that id, the text before a trailing parenthesis,
 * which is then its variant ("Mighty Blow (+1)"). A text or base that
 * several skills share is ambiguous and unresolved. A characteristic gain
 * must be a +1 under the characteristics category, and a skill must be
 * primary or secondary. One report that cannot be resolved leaves the whole
 * player unresolved.
 *
 * Pure decision logic, with no I/O and no dependencies.
 */
@Injectable()
export class FeedSkillResolverService {
  resolve(input: ResolveStepsInput): ResolvedStep[] | undefined {
    const steps: ResolvedStep[] = [];
    for (const row of input.reports) {
      const step = this.step(row, input.skillNames);
      if (step === undefined) {
        return undefined;
      }
      steps.push(step);
    }
    return steps;
  }

  private step(
    row: TpFeedHistoryReport,
    skillNames: readonly SkillNameRow[],
  ): ResolvedStep | undefined {
    const { selection, category, gain, sppCost } = row;
    if (
      selection === null ||
      category === null ||
      gain === null ||
      sppCost === null
    ) {
      return undefined;
    }
    if ('characteristic' in gain) {
      return category === 'characteristics' && gain.delta === 1
        ? {
            kind: 'characteristic',
            characteristic: CHARACTERISTIC_KEYS_BY_NAME[gain.characteristic],
            selection,
            reportedCost: sppCost,
          }
        : undefined;
    }
    if (category === 'characteristics') {
      return undefined;
    }
    const named = this.named(gain.skill, skillNames);
    return named === undefined
      ? undefined
      : { kind: 'skill', ...named, selection, category, reportedCost: sppCost };
  }

  private named(
    text: string,
    skillNames: readonly SkillNameRow[],
  ): NamedSkill | undefined {
    const whole = this.lookup(text, skillNames);
    if (whole.found === 'ambiguous') {
      return undefined;
    }
    if (whole.found === 'one') {
      return { ...whole.skill, nameId: text, attributeValue: null };
    }
    const variant = VARIANT.exec(text);
    const attributeValue = variant?.[2].trim();
    if (
      variant === null ||
      attributeValue === undefined ||
      attributeValue === ''
    ) {
      return undefined;
    }
    const base = this.lookup(variant[1], skillNames);
    return base.found === 'one'
      ? { ...base.skill, nameId: variant[1], attributeValue }
      : undefined;
  }

  /** Whether none, one or several distinct skills have this Name id. */
  private lookup(
    nameId: string,
    skillNames: readonly SkillNameRow[],
  ): SkillLookup {
    const rows = skillNames.filter((row) => row.nameId === nameId);
    const skillIds = new Set(rows.map((row) => row.skillId));
    if (skillIds.size === 0) {
      return { found: 'none' };
    }
    return skillIds.size === 1
      ? {
          found: 'one',
          skill: { skillId: rows[0].skillId, skillName: rows[0].skillName },
        }
      : { found: 'ambiguous' };
  }
}
