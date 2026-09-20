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

import type { RaceRulesSetRow } from '../shared/race-positions-query.service';
import { RacePositionsQueryService } from '../shared/race-positions-query.service';
import type { SampledRace } from '../shared/review.types';

/** What a cell shows for a stored row that carries no keywords. */
const NO_KEYWORDS = 'none';

/** A (position, rules set) pair with no `position_rules_sets` row at all. */
const MISSING = 'missing (no characteristics row)';

/**
 * What the importers and curation actually stored in
 * `position_rules_set_keywords`, one sub-table per rules set the race's eras
 * map to.
 *
 * A position with a characteristics row but no keywords shows "none": that is
 * the whole truth for every pre-BB2025 rules set, where the concept does not
 * exist. A position with no `position_rules_sets` row at all is shown as an
 * explicit, highlighted "missing" row instead, because a keyword can only
 * hang off such a row — exactly as `PositionStartingSkillsDbRendererService`
 * highlights the same absence.
 *
 * Keywords are read straight from `packages/db` — never through
 * `packages/game-data`.
 *
 * This panel deliberately does NOT diff itself against the raw panel: only TP
 * publishes keyword codes, resolved through this tool's own curated
 * catalogue rather than the database's, so lining them up here would mean
 * re-running the importer's own resolution — the thing under review. The two
 * panels sit side by side and the reviewer compares them.
 */
@Injectable()
export class PositionKeywordsDbRendererService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly query: RacePositionsQueryService,
    private readonly html: HtmlService,
  ) {}

  async render(race: SampledRace): Promise<string> {
    const positions = await this.query.positionsFor(race.raceId);
    const positionNames = new Map(
      positions.map((position) => [position.positionId, position.positionName]),
    );
    if (positionNames.size === 0) {
      return this.html.note(
        `No positions stored for race "${race.raceName}", so no keywords to show.`,
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
    const stored = await this.storedKeywords([...rowIds.values()]);
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
          // Cell 0 is the position name, so the keywords cell is cell 1.
          return this.html.highlight([positionName, MISSING], [1]);
        }
        const keywordNames = stored.get(rowId) ?? [];
        return [
          positionName,
          keywordNames.length === 0 ? NO_KEYWORDS : keywordNames.join(', '),
        ];
      },
    );
    return (
      this.html.subheading(rulesSet.rulesSetName) +
      this.html.table(['Position', 'Keywords'], rows)
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
