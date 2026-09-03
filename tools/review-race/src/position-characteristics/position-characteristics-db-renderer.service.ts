import type { Db } from '@blood-bowl-tracker/db';
import { DB, positionRulesSets } from '@blood-bowl-tracker/db';
import type { TableCell, TableRow } from '@blood-bowl-tracker/review-harness';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Inject, Injectable } from '@nestjs/common';
import { inArray } from 'drizzle-orm';

import type { RaceRulesSetRow } from '../shared/race-positions-query.service';
import { RacePositionsQueryService } from '../shared/race-positions-query.service';
import type { SampledRace } from '../shared/review.types';
import { CharacteristicFormatService } from './characteristic-format.service';

/** `${positionId}:${rulesSetId}` -> the stored characteristics row. */
type StoredRows = Map<
  string,
  {
    move: number;
    strength: number;
    agility: number;
    passing: number | null;
    armour: number;
  }
>;

/**
 * What the importers and curation actually stored in `position_rules_sets`,
 * one sub-table per rules set the race's eras map to, each value rendered in
 * that rules set's own display format. A position with no row for a rules set
 * is shown as an explicit, highlighted "missing" row rather than omitted: a
 * missing row means "this position did not exist under that rules set", which
 * is exactly the claim a reviewer needs to see and check.
 */
@Injectable()
export class PositionCharacteristicsDbRendererService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly query: RacePositionsQueryService,
    private readonly formats: CharacteristicFormatService,
    private readonly html: HtmlService,
  ) {}

  async render(race: SampledRace): Promise<string> {
    const positions = await this.query.positionsFor(race.raceId);
    const unique = new Map(
      positions.map((position) => [position.positionId, position.positionName]),
    );
    if (unique.size === 0) {
      return this.html.note(
        `No positions stored for race "${race.raceName}", so no characteristics to show.`,
      );
    }
    const rulesSets = await this.query.rulesSetsFor(race.raceId);
    if (rulesSets.length === 0) {
      return this.html.note(
        `Race "${race.raceName}" has no era mapped to a rules set.`,
      );
    }
    const stored = await this.storedRows([...unique.keys()]);
    return rulesSets
      .map((rulesSet) => this.rulesSetTable({ rulesSet, unique, stored }))
      .join('\n');
  }

  private rulesSetTable(input: {
    rulesSet: RaceRulesSetRow;
    unique: Map<number, string>;
    stored: StoredRows;
  }): string {
    const { rulesSet, unique, stored } = input;
    const rows: TableRow[] = [...unique.entries()].map(
      ([positionId, positionName]) => {
        const row = stored.get(`${positionId}:${rulesSet.rulesSetId}`);
        if (row === undefined) {
          return this.html.highlight([
            positionName,
            'missing',
            'missing',
            'missing',
            'missing',
            'missing',
          ]);
        }
        const cells: TableCell[] = [
          positionName,
          this.formats.format(row.move, rulesSet.moveFormat),
          this.formats.format(row.strength, rulesSet.strengthFormat),
          this.formats.format(row.agility, rulesSet.agilityFormat),
          this.formats.format(row.passing, rulesSet.passingFormat),
          this.formats.format(row.armour, rulesSet.armourFormat),
        ];
        return cells;
      },
    );
    return (
      this.html.subheading(rulesSet.rulesSetName) +
      this.html.table(['Position', 'MA', 'ST', 'AG', 'PA', 'AV'], rows)
    );
  }

  private async storedRows(positionIds: number[]): Promise<StoredRows> {
    const rows = await this.db
      .select({
        positionId: positionRulesSets.positionId,
        rulesSetId: positionRulesSets.rulesSetId,
        move: positionRulesSets.move,
        strength: positionRulesSets.strength,
        agility: positionRulesSets.agility,
        passing: positionRulesSets.passing,
        armour: positionRulesSets.armour,
      })
      .from(positionRulesSets)
      .where(inArray(positionRulesSets.positionId, positionIds));
    const stored: StoredRows = new Map();
    for (const row of rows) {
      stored.set(`${row.positionId}:${row.rulesSetId}`, row);
    }
    return stored;
  }
}
