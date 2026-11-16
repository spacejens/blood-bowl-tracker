import { Injectable } from '@nestjs/common';

import type {
  PositionProfile,
  PositionRulesSetRow,
  PositionSkillRow,
  ProfileSkill,
} from './fill-plan.types';

export interface PositionProfileInput {
  /** The position's rows under the rules sets of one era. */
  rows: readonly PositionRulesSetRow[];
  /** Starting skills of those rows (others are ignored). */
  skills: readonly PositionSkillRow[];
}

/**
 * Decides whether a position's stored data is certain in one era: exactly
 * one profile (characteristics, characteristic formats and starting skills)
 * across the era's rules sets. Two rules sets that agree count as one. A
 * starting skill with no Name-system id cannot be referenced by a fill, and
 * one with an empty attribute value cannot be written to one, so either
 * makes the position uncertain too.
 *
 * Pure decision logic, with no I/O and no dependencies.
 */
@Injectable()
export class PositionProfileService {
  resolve(input: PositionProfileInput): PositionProfile | undefined {
    if (input.rows.length === 0) {
      return undefined;
    }
    const profiles = input.rows.map((row) => this.profileOf(row, input.skills));
    if (profiles.some((profile) => profile === undefined)) {
      return undefined;
    }
    const distinct = new Set(
      profiles.map((profile) => JSON.stringify(profile)),
    );
    return distinct.size === 1 ? profiles[0] : undefined;
  }

  private profileOf(
    row: PositionRulesSetRow,
    skills: readonly PositionSkillRow[],
  ): PositionProfile | undefined {
    const own = skills.filter(
      (skill) => skill.positionRulesSetId === row.positionRulesSetId,
    );
    const named: ProfileSkill[] = [];
    for (const skill of own) {
      if (skill.nameId === null || skill.attributeValue === '') {
        return undefined;
      }
      named.push({
        skillId: skill.skillId,
        nameId: skill.nameId,
        attributeValue: skill.attributeValue,
      });
    }
    named.sort(
      (a, b) =>
        this.compare(a.nameId, b.nameId) ||
        this.compare(a.attributeValue ?? '', b.attributeValue ?? ''),
    );
    // Keys are listed explicitly so the JSON comparison above does not
    // depend on the key order the query happened to produce.
    return {
      line: {
        ma: row.line.ma,
        st: row.line.st,
        ag: row.line.ag,
        pa: row.line.pa,
        av: row.line.av,
      },
      formats: {
        ma: row.formats.ma,
        st: row.formats.st,
        ag: row.formats.ag,
        pa: row.formats.pa,
        av: row.formats.av,
      },
      skills: named,
    };
  }

  /** Code-unit order, so the result does not depend on the runtime's locale. */
  private compare(a: string, b: string): number {
    if (a < b) {
      return -1;
    }
    return a > b ? 1 : 0;
  }
}
