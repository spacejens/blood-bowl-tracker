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
const MISSING = 'missing';

/**
 * What the importers and curation actually stored in
 * `position_rules_set_keywords`, one sub-table per rules set the race's eras
 * map to.
 *
 * A position with a characteristics row but no keywords shows "none": that
 * covers a species keyword under any pre-BB2025 rules set (species keywords
 * are BB2025-only) as well as a genuine absence of positional keywords
 * (including Big Guy) under any rules set. A position with no
 * `position_rules_sets` row at all is shown as an
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
    // A position row carries the one era it belongs to; a race can span
    // several eras, and each era maps to its own rules set(s), so a position
    // from one era is not automatically available under another era's rules
    // set. Track which era(s) each position belongs to and which era(s) each
    // rules set is reachable from, so a rules set's table only ever lists
    // the positions actually available under it -- never a cross-product of
    // every position against every rules set the race's eras produce.
    const positionEraIds = this.query.positionEraIds(positions);
    const rulesSetEraIds = await this.query.rulesSetEraIds(race.raceId);
    const positionIds = [...positionNames.keys()];
    const rowIds = await this.rowIds(positionIds);
    const stored = await this.storedKeywords([...rowIds.values()]);
    return rulesSets
      .map((rulesSet) =>
        this.rulesSetTable({
          rulesSet,
          positionNames,
          positionEraIds,
          rulesSetEraIds,
          rowIds,
          stored,
        }),
      )
      .join('\n');
  }

  private rulesSetTable(input: {
    rulesSet: RaceRulesSetRow;
    positionNames: Map<number, string>;
    positionEraIds: Map<number, Set<number>>;
    rulesSetEraIds: Map<number, Set<number>>;
    rowIds: Map<string, number>;
    stored: Map<number, string[]>;
  }): string {
    const {
      rulesSet,
      positionNames,
      positionEraIds,
      rulesSetEraIds,
      rowIds,
      stored,
    } = input;
    // Every rules set here came from the same raceEras <-> eraRulesSets join
    // that produced rulesSetEraIds, so this fallback can't actually be hit --
    // kept only as a defensive default for the Map lookup.
    const validEraIds =
      rulesSetEraIds.get(rulesSet.rulesSetId) ?? new Set<number>();
    const rows: TableRow[] = [];
    for (const [positionId, positionName] of positionNames.entries()) {
      const eraIds = positionEraIds.get(positionId) ?? new Set<number>();
      const availableUnderThisRulesSet = [...eraIds].some((eraId) =>
        validEraIds.has(eraId),
      );
      if (!availableUnderThisRulesSet) {
        continue;
      }
      const rowId = rowIds.get(`${positionId}:${rulesSet.rulesSetId}`);
      if (rowId === undefined) {
        // Cell 0 is the position name, so the keywords cell is cell 1.
        rows.push(this.html.highlight([positionName, MISSING], [1]));
        continue;
      }
      const keywordNames = stored.get(rowId) ?? [];
      rows.push([
        positionName,
        keywordNames.length === 0 ? NO_KEYWORDS : keywordNames.join(', '),
      ]);
    }
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
