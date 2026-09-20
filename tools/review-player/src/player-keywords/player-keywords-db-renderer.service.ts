import type { Db } from '@blood-bowl-tracker/db';
import {
  asc,
  DB,
  eq,
  inArray,
  keywords,
  players,
  positionRulesSetKeywords,
  positionRulesSets,
  rulesSets,
} from '@blood-bowl-tracker/db';
import type { TableRow } from '@blood-bowl-tracker/review-harness';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Inject, Injectable } from '@nestjs/common';

import type { SampledPlayer } from '../shared/review.types';

/** What a cell shows for a rules set that carries no keywords. */
const NO_KEYWORDS = 'none';

/**
 * What the importers and curation actually stored for this player's
 * *position*, one row per rules set that position has a `position_rules_sets`
 * row under -- a player carries no keywords of their own; a keyword hangs off
 * their position, under whichever rules set applies.
 *
 * Every rules set the position maps to is shown, not only the one the
 * player's own era resolves to, so a reviewer can see the era's rules set
 * alongside the others rather than this panel deciding which one applies --
 * deciding that is the importer's job, and duplicating the decision here
 * would let the tool agree with a bug instead of showing it.
 *
 * Keywords are read straight from `packages/db` -- never through
 * `packages/game-data`. This panel deliberately does NOT diff itself against
 * the raw panel: only TP publishes keyword codes, resolved through this
 * tool's own curated catalogue rather than the database's, so lining them up
 * here would mean re-running the importer's own resolution -- the thing
 * under review. The two panels sit side by side and the reviewer compares
 * them.
 */
@Injectable()
export class PlayerKeywordsDbRendererService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly html: HtmlService,
  ) {}

  async render(player: SampledPlayer): Promise<string> {
    const positionId = await this.positionIdFor(player.playerId);
    if (positionId === undefined) {
      return this.html.note(
        `No player row with id ${player.playerId} in the database.`,
      );
    }
    const rulesSetRows = await this.rulesSetRows(positionId);
    if (rulesSetRows.length === 0) {
      return this.html.note(
        `Position "${player.positionName}" has no characteristics row under any rules set.`,
      );
    }
    const stored = await this.storedKeywords(rulesSetRows.map((row) => row.id));
    const rows: TableRow[] = rulesSetRows.map((row) => {
      const keywordNames = stored.get(row.id) ?? [];
      return [
        row.rulesSetName,
        keywordNames.length === 0 ? NO_KEYWORDS : keywordNames.join(', '),
      ];
    });
    return this.html.table(['Rules set', 'Keywords'], rows);
  }

  private async positionIdFor(playerId: number): Promise<number | undefined> {
    const rows = await this.db
      .select({ positionId: players.positionId })
      .from(players)
      .where(eq(players.id, playerId));
    return rows[0]?.positionId;
  }

  /** Every `position_rules_sets` row this position has, with its rules set's name. */
  private async rulesSetRows(
    positionId: number,
  ): Promise<{ id: number; rulesSetName: string }[]> {
    return await this.db
      .select({ id: positionRulesSets.id, rulesSetName: rulesSets.name })
      .from(positionRulesSets)
      .innerJoin(rulesSets, eq(rulesSets.id, positionRulesSets.rulesSetId))
      .where(eq(positionRulesSets.positionId, positionId))
      .orderBy(asc(rulesSets.name));
  }

  /**
   * `position_rules_sets.id` -> its stored keyword names. Only ever called
   * with at least one row id -- `render` returns early when
   * `rulesSetRows()` is empty -- so no empty-input guard is needed here.
   */
  private async storedKeywords(
    rowIds: number[],
  ): Promise<Map<number, string[]>> {
    const byRow = new Map<number, string[]>();
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
