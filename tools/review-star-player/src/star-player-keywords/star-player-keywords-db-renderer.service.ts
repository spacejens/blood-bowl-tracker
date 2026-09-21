import type { Db } from '@blood-bowl-tracker/db';
import {
  asc,
  DB,
  eq,
  inArray,
  keywords,
  positionRulesSetKeywords,
  positionRulesSets,
} from '@blood-bowl-tracker/db';
import type { TableRow } from '@blood-bowl-tracker/review-harness';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Inject, Injectable } from '@nestjs/common';

import type { SampledStarPlayer } from '../shared/review.types';
import { StarPlayerPositionsQueryService } from '../shared/star-player-positions-query.service';

/** What a cell shows for a stored row that carries no keywords. */
const NO_KEYWORDS = 'none';

/** A rules set the star is hireable under with no `position_rules_sets` row. */
const MISSING = 'missing (no characteristics row)';

/**
 * What the importers and curation actually stored in
 * `position_rules_set_keywords` for this star, one row per rules set its
 * stored eligibility implies.
 *
 * A rules set with a characteristics row but no keywords shows "none": that
 * covers a species keyword under any pre-BB2025 rules set (species keywords
 * are BB2025-only) as well as a genuine absence of positional keywords
 * (including Big Guy) under any rules set. A rules set with no
 * `position_rules_sets` row at all is shown as
 * an explicit, highlighted "missing" row instead, because a keyword can only
 * hang off such a row -- exactly as `StarPlayerSkillsDbRendererService`
 * highlights the same absence.
 *
 * Keywords are read straight from `packages/db` -- never through
 * `packages/game-data`.
 *
 * This panel deliberately does NOT diff itself against the raw panel: only TP
 * publishes keyword codes, resolved through this tool's own curated
 * catalogue rather than the database's, so lining them up here would mean
 * re-running the importer's own resolution -- the thing under review. The two
 * panels sit side by side and the reviewer compares them.
 */
@Injectable()
export class StarPlayerKeywordsDbRendererService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly query: StarPlayerPositionsQueryService,
    private readonly html: HtmlService,
  ) {}

  async render(star: SampledStarPlayer): Promise<string> {
    const rulesSets = await this.query.rulesSetsFor(star.positionId);
    if (rulesSets.length === 0) {
      return this.html.note(
        `Star player "${star.positionName}" has no era mapped to a rules set.`,
      );
    }
    const rowIds = await this.rowIds(star.positionId);
    const stored = await this.storedKeywords([...rowIds.values()]);
    const rows: TableRow[] = rulesSets.map((rulesSet) => {
      const rowId = rowIds.get(rulesSet.rulesSetId);
      if (rowId === undefined) {
        // Cell 0 is the rules set name, so the keywords cell is cell 1.
        return this.html.highlight([rulesSet.rulesSetName, MISSING], [1]);
      }
      const keywordNames = stored.get(rowId) ?? [];
      return [
        rulesSet.rulesSetName,
        keywordNames.length === 0 ? NO_KEYWORDS : keywordNames.join(', '),
      ];
    });
    return this.html.table(['Rules set', 'Keywords'], rows);
  }

  /** `rulesSetId` -> `position_rules_sets.id`, for this one star. */
  private async rowIds(positionId: number): Promise<Map<number, number>> {
    const rows = await this.db
      .select({
        id: positionRulesSets.id,
        rulesSetId: positionRulesSets.rulesSetId,
      })
      .from(positionRulesSets)
      .where(eq(positionRulesSets.positionId, positionId));
    const byRulesSet = new Map<number, number>();
    for (const row of rows) {
      byRulesSet.set(row.rulesSetId, row.id);
    }
    return byRulesSet;
  }

  /** `position_rules_sets.id` -> its stored keyword names. */
  private async storedKeywords(
    rowIds: number[],
  ): Promise<Map<number, string[]>> {
    const byRow = new Map<number, string[]>();
    if (rowIds.length === 0) {
      return byRow;
    }
    const rows = await this.db
      .select({
        positionRulesSetId: positionRulesSetKeywords.positionRulesSetId,
        keywordName: keywords.name,
      })
      .from(positionRulesSetKeywords)
      .innerJoin(keywords, eq(keywords.id, positionRulesSetKeywords.keywordId))
      .where(inArray(positionRulesSetKeywords.positionRulesSetId, rowIds))
      .orderBy(
        asc(positionRulesSetKeywords.positionRulesSetId),
        asc(keywords.name),
      );
    for (const row of rows) {
      byRow.set(row.positionRulesSetId, [
        ...(byRow.get(row.positionRulesSetId) ?? []),
        row.keywordName,
      ]);
    }
    return byRow;
  }
}
