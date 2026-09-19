import type { Db } from '@blood-bowl-tracker/db';
import {
  and,
  asc,
  DB,
  eq,
  inArray,
  positionRulesSets,
  positionRulesSetSkills,
  skillRulesSets,
  skills,
} from '@blood-bowl-tracker/db';
import type { TableRow } from '@blood-bowl-tracker/review-harness';
import {
  HtmlService,
  SkillFormatService,
} from '@blood-bowl-tracker/review-harness';
import { Inject, Injectable } from '@nestjs/common';

import type { RaceRulesSetRow } from '../shared/race-positions-query.service';
import { RacePositionsQueryService } from '../shared/race-positions-query.service';
import type { SampledRace } from '../shared/review.types';

/** What a cell shows for a stored row that carries no starting skills. */
const NO_SKILLS = 'none';

/** A (position, rules set) pair with no `position_rules_sets` row at all. */
const MISSING = 'missing (no characteristics row)';

/**
 * What the importers and curation actually stored in
 * `position_rules_set_skills`, one sub-table per rules set the race's eras map
 * to.
 *
 * A position with a characteristics row but no starting skills shows "none":
 * that is the common, legitimate case (most linemen). A position with no
 * `position_rules_sets` row at all is shown as an explicit, highlighted
 * "missing" row instead, because a starting skill can only hang off such a
 * row — exactly as `PositionCharacteristicsDbRendererService` highlights the
 * same absence.
 *
 * Skills are read straight from `packages/db` — never through
 * `packages/game-data` — and rendered with `SkillFormatService`, marking only
 * a `unique`-category skill (a star's own exclusive skill). Random and elite
 * are advancement-only concepts and never appear on a starting skill.
 *
 * This panel deliberately does NOT diff itself against the raw panel: BBL's
 * skills carry no rules set, TP's carry per-rules-set ids and the curated
 * file carries `Name` external ids, so matching them up would mean re-running
 * the importers' own resolution — which is the thing under review. The two
 * panels sit side by side and the reviewer compares them.
 */
@Injectable()
export class PositionStartingSkillsDbRendererService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly query: RacePositionsQueryService,
    private readonly skillFormat: SkillFormatService,
    private readonly html: HtmlService,
  ) {}

  async render(race: SampledRace): Promise<string> {
    const positions = await this.query.positionsFor(race.raceId);
    const positionNames = new Map(
      positions.map((position) => [position.positionId, position.positionName]),
    );
    if (positionNames.size === 0) {
      return this.html.note(
        `No positions stored for race "${race.raceName}", so no starting skills to show.`,
      );
    }
    const rulesSets = await this.query.rulesSetsFor(race.raceId);
    if (rulesSets.length === 0) {
      return this.html.note(
        `Race "${race.raceName}" has no era mapped to a rules set.`,
      );
    }
    const positionIds = [...positionNames.keys()];
    const rowIds = await this.rowIds(positionIds);
    const stored = await this.storedSkills([...rowIds.values()]);
    return rulesSets
      .map((rulesSet) =>
        this.rulesSetTable({ rulesSet, positionNames, rowIds, stored }),
      )
      .join('\n');
  }

  private rulesSetTable(input: {
    rulesSet: RaceRulesSetRow;
    positionNames: Map<number, string>;
    rowIds: Map<string, number>;
    stored: Map<number, string[]>;
  }): string {
    const { rulesSet, positionNames, rowIds, stored } = input;
    const rows: TableRow[] = [...positionNames.entries()].map(
      ([positionId, positionName]) => {
        const rowId = rowIds.get(`${positionId}:${rulesSet.rulesSetId}`);
        if (rowId === undefined) {
          // Cell 0 is the position name, so the skills cell is cell 1.
          return this.html.highlight([positionName, MISSING], [1]);
        }
        const skillTexts = stored.get(rowId) ?? [];
        return [
          positionName,
          skillTexts.length === 0 ? NO_SKILLS : skillTexts.join(', '),
        ];
      },
    );
    return (
      this.html.subheading(rulesSet.rulesSetName) +
      this.html.table(['Position', 'Starting skills'], rows)
    );
  }

  /** `${positionId}:${rulesSetId}` -> `position_rules_sets.id`. */
  private async rowIds(positionIds: number[]): Promise<Map<string, number>> {
    const rows = await this.db
      .select({
        id: positionRulesSets.id,
        positionId: positionRulesSets.positionId,
        rulesSetId: positionRulesSets.rulesSetId,
      })
      .from(positionRulesSets)
      .where(inArray(positionRulesSets.positionId, positionIds));
    const byKey = new Map<string, number>();
    for (const row of rows) {
      byKey.set(`${row.positionId}:${row.rulesSetId}`, row.id);
    }
    return byKey;
  }

  /**
   * `position_rules_sets.id` -> its formatted starting skills. The category
   * comes from a LEFT join, so a skill with no `skill_rules_sets` row for the
   * rules set (itself a curation gap worth seeing) still renders, just
   * without the unique marker.
   */
  private async storedSkills(rowIds: number[]): Promise<Map<number, string[]>> {
    const byRow = new Map<number, string[]>();
    if (rowIds.length === 0) {
      return byRow;
    }
    const rows = await this.db
      .select({
        positionRulesSetId: positionRulesSetSkills.positionRulesSetId,
        skillName: skills.name,
        attributeValue: positionRulesSetSkills.attributeValue,
        category: skillRulesSets.category,
      })
      .from(positionRulesSetSkills)
      .innerJoin(
        positionRulesSets,
        eq(positionRulesSets.id, positionRulesSetSkills.positionRulesSetId),
      )
      .innerJoin(skills, eq(skills.id, positionRulesSetSkills.skillId))
      .leftJoin(
        skillRulesSets,
        and(
          eq(skillRulesSets.skillId, positionRulesSetSkills.skillId),
          eq(skillRulesSets.rulesSetId, positionRulesSets.rulesSetId),
        ),
      )
      .where(inArray(positionRulesSetSkills.positionRulesSetId, rowIds))
      .orderBy(
        asc(positionRulesSetSkills.positionRulesSetId),
        asc(skills.name),
      );
    for (const row of rows) {
      const formatted = this.skillFormat.format({
        name: row.skillName,
        attributeValue: row.attributeValue,
        isUnique: row.category === 'unique',
      });
      byRow.set(row.positionRulesSetId, [
        ...(byRow.get(row.positionRulesSetId) ?? []),
        formatted,
      ]);
    }
    return byRow;
  }
}
