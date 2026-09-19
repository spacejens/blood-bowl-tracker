import type { TableRow } from '@blood-bowl-tracker/review-harness';
import {
  HtmlService,
  SkillFormatService,
} from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import type { SampledStarPlayer } from '../shared/review.types';
import type { StarPlayerSkillRow } from '../shared/star-player-positions-query.service';
import { StarPlayerPositionsQueryService } from '../shared/star-player-positions-query.service';

/**
 * What the importers and curation stored in `position_rules_set_skills` for
 * this star, one row per rules set its stored eligibility implies.
 *
 * A rules set with no stored skills at all is shown as an explicit,
 * highlighted "missing" row rather than omitted: unlike an ordinary position,
 * a star with no starting skills is not a normal state, and a star's stat
 * line being present while its skills are absent is exactly the gap a
 * reviewer needs to see. A stored skill whose rules set no era maps to is
 * listed as a trailing orphan row, so it cannot hide.
 *
 * Only the `unique` category is marked (the star's own exclusive skill);
 * random and elite are advancement-only concepts. Read straight from
 * `packages/db`, never through `packages/game-data`.
 *
 * This panel is deliberately not diffed against the raw panel: BBL's skills
 * carry no rules set at all and TP names skills by per-rules-set id, so
 * matching them up would mean re-running the importer's own resolution, which
 * is the thing under review.
 */
@Injectable()
export class StarPlayerSkillsDbRendererService {
  constructor(
    private readonly query: StarPlayerPositionsQueryService,
    private readonly skillFormat: SkillFormatService,
    private readonly html: HtmlService,
  ) {}

  async render(star: SampledStarPlayer): Promise<string> {
    const rulesSets = await this.query.rulesSetsFor(star.positionId);
    const stored = await this.query.skillsFor(star.positionId);
    if (rulesSets.length === 0 && stored.length === 0) {
      return this.html.note(
        `Star player "${star.positionName}" has no era mapped to a rules set, and no stored starting skills.`,
      );
    }
    const byRulesSet = new Map<number, string[]>();
    for (const row of stored) {
      byRulesSet.set(row.rulesSetId, [
        ...(byRulesSet.get(row.rulesSetId) ?? []),
        this.format(row),
      ]);
    }
    const rows: TableRow[] = rulesSets.map((rulesSet) => {
      const skills = byRulesSet.get(rulesSet.rulesSetId);
      // Cell 0 is the rules set name, so the skills cell is cell 1.
      return skills === undefined || skills.length === 0
        ? this.html.highlight([rulesSet.rulesSetName, 'missing'], [1])
        : [rulesSet.rulesSetName, skills.join(', ')];
    });
    const known = new Set(rulesSets.map((rulesSet) => rulesSet.rulesSetId));
    for (const [rulesSetId, skills] of byRulesSet) {
      if (!known.has(rulesSetId)) {
        rows.push(
          this.html.highlight([
            `rules set id ${rulesSetId} (not implied by any era)`,
            skills.join(', '),
          ]),
        );
      }
    }
    const table = this.html.table(['Rules set', 'Starting skills'], rows);
    return rulesSets.length === 0
      ? this.html.note(
          `Star player "${star.positionName}" has no era mapped to a rules set.`,
        ) + table
      : table;
  }

  private format(row: StarPlayerSkillRow): string {
    return this.skillFormat.format({
      name: row.skillName,
      attributeValue: row.attributeValue,
      isUnique: row.category === 'unique',
    });
  }
}
