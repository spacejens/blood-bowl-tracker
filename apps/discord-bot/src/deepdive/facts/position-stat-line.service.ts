import type {
  PositionCharacteristics,
  PositionStartingSkill,
} from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';

import { PositionCharacteristicsLineFormatterService } from './position-characteristics-line-formatter.service';

/**
 * Shown in place of the skill list for a rules set with no starting skills
 * recorded. The schema cannot tell "this position genuinely has none" apart
 * from "nobody has curated this rules set yet", so one neutral placeholder
 * covers both rather than claiming either.
 */
const NO_SKILLS_PLACEHOLDER = '-';

/**
 * Prefixed to a star player's own exclusive skill. A skill is exclusive
 * purely by virtue of its `unique` category under that rules set -- there is
 * no separate flag, by deliberate schema design.
 */
const UNIQUE_SKILL_MARKER = '★ ';

/**
 * Composes one position's full stat line under one rules set: the
 * characteristics, then that rules set's starting skills.
 *
 * The characteristics half is delegated to
 * `PositionCharacteristicsLineFormatterService` rather than reimplemented,
 * so the two halves cannot disagree about formatting, and so a rules set
 * without a Passing characteristic keeps dropping the field entirely.
 *
 * Skills are appended after a single space with no separating punctuation:
 * an em dash was considered and rejected as confusable with the `N+`
 * characteristic notation this same line already uses. `skills` is expected
 * to already be in display order (`listByPosition` orders by skill name), so
 * a star's `unique`-category skill falls wherever its name sorts rather than
 * always leading or trailing the list -- only the `★ ` marker distinguishes
 * it, not its position.
 *
 * Shared by the position deepdive and the star player deepdive -- a star is
 * stored as a `positions` row, so both views render the same shape and must
 * read identically. Pure text assembly, with no I/O and no external state.
 */
@Injectable()
export class PositionStatLineService {
  constructor(
    private readonly lineFormatter: PositionCharacteristicsLineFormatterService,
  ) {}

  /**
   * One line per characteristics row, in the order given, each paired with
   * only its own rules set's skills. Grouping lives here rather than in each
   * caller so the two deepdives cannot pair them differently.
   */
  formatLines(
    rows: PositionCharacteristics[],
    skills: PositionStartingSkill[],
  ): string[] {
    const byRulesSet = new Map<number, PositionStartingSkill[]>();
    for (const skill of skills) {
      const existing = byRulesSet.get(skill.rulesSetId);
      if (existing === undefined) {
        byRulesSet.set(skill.rulesSetId, [skill]);
      } else {
        existing.push(skill);
      }
    }
    return rows.map((row) =>
      this.formatLine(row, byRulesSet.get(row.rulesSetId) ?? []),
    );
  }

  /**
   * `BB2020: MA 7 ST 3 AG 3+ PA 4+ AV 9+ Block, Dodge, ★ Mighty Blow
   * (Grombrindal)`. `skills` must already be narrowed to this row's own
   * rules set.
   */
  formatLine(
    row: PositionCharacteristics,
    skills: PositionStartingSkill[],
  ): string {
    const suffix =
      skills.length === 0
        ? NO_SKILLS_PLACEHOLDER
        : skills.map((skill) => this.formatSkill(skill)).join(', ');
    return `${this.lineFormatter.formatLine(row)} ${suffix}`;
  }

  /** `Block`, `Loner (4+)`, or `★ Mighty Blow (Grombrindal)`. */
  private formatSkill(skill: PositionStartingSkill): string {
    const marker = skill.category === 'unique' ? UNIQUE_SKILL_MARKER : '';
    const attribute =
      skill.attributeValue === null ? '' : ` (${skill.attributeValue})`;
    return `${marker}${skill.skillName}${attribute}`;
  }
}
