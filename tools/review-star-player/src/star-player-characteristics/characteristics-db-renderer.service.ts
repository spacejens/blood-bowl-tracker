import type { TableCell, TableRow } from '@blood-bowl-tracker/review-harness';
import {
  CharacteristicFormatService,
  HtmlService,
} from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import type { SampledStarPlayer } from '../shared/review.types';
import type {
  StarPlayerCharacteristicsRow,
  StarPlayerRulesSetRow,
} from '../shared/star-player-positions-query.service';
import { StarPlayerPositionsQueryService } from '../shared/star-player-positions-query.service';

/**
 * What the importers and curation stored in `position_rules_sets` for this
 * star, one row per rules set its stored eligibility implies, each value
 * rendered in that rules set's own display format.
 *
 * A rules set with no row is shown as an explicit, highlighted "missing" row
 * rather than omitted: a missing row means "this star did not exist under
 * that rules set", which is exactly the claim a reviewer needs to check —
 * and given `tools/import-bbl`'s star-player exception links a star to every
 * era its races span, it is also the most likely place for a wrong claim.
 *
 * A stored row whose rules set no era maps to is listed too, as a trailing
 * `rules set id <n>` row, so orphaned characteristics cannot hide.
 */
@Injectable()
export class StarPlayerCharacteristicsDbRendererService {
  constructor(
    private readonly query: StarPlayerPositionsQueryService,
    private readonly formats: CharacteristicFormatService,
    private readonly html: HtmlService,
  ) {}

  async render(star: SampledStarPlayer): Promise<string> {
    const rulesSets = await this.query.rulesSetsFor(star.positionId);
    const stored = await this.query.characteristicsFor(star.positionId);
    if (rulesSets.length === 0 && stored.length === 0) {
      return this.html.note(
        `Star player "${star.positionName}" has no era mapped to a rules set, and no stored characteristics.`,
      );
    }
    const byRulesSet = new Map(stored.map((row) => [row.rulesSetId, row]));
    const rows: TableRow[] = rulesSets.map((rulesSet) =>
      this.row(rulesSet, byRulesSet.get(rulesSet.rulesSetId)),
    );
    const known = new Set(rulesSets.map((rulesSet) => rulesSet.rulesSetId));
    for (const row of stored) {
      if (!known.has(row.rulesSetId)) {
        rows.push(this.orphanRow(row));
      }
    }
    const table = this.html.table(
      ['Rules set', 'MA', 'ST', 'AG', 'PA', 'AV'],
      rows,
    );
    return rulesSets.length === 0
      ? this.html.note(
          `Star player "${star.positionName}" has no era mapped to a rules set.`,
        ) + table
      : table;
  }

  private row(
    rulesSet: StarPlayerRulesSetRow,
    stored: StarPlayerCharacteristicsRow | undefined,
  ): TableRow {
    if (stored === undefined) {
      return this.html.highlight([
        rulesSet.rulesSetName,
        'missing',
        'missing',
        'missing',
        'missing',
        'missing',
      ]);
    }
    const cells: TableCell[] = [
      rulesSet.rulesSetName,
      this.formats.format(stored.move, rulesSet.moveFormat),
      this.formats.format(stored.strength, rulesSet.strengthFormat),
      this.formats.format(stored.agility, rulesSet.agilityFormat),
      this.formats.format(stored.passing, rulesSet.passingFormat),
      this.formats.format(stored.armour, rulesSet.armourFormat),
    ];
    return cells;
  }

  /** A stored row whose rules set this star's eligibility never implies. */
  private orphanRow(stored: StarPlayerCharacteristicsRow): TableRow {
    return this.html.highlight([
      `rules set id ${stored.rulesSetId} (not implied by any era)`,
      String(stored.move),
      String(stored.strength),
      String(stored.agility),
      stored.passing === null ? '—' : String(stored.passing),
      String(stored.armour),
    ]);
  }
}
