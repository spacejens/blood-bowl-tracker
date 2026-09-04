import type { Db } from '@blood-bowl-tracker/db';
import {
  DB,
  eraRulesSets,
  players,
  positionRulesSets,
  rulesSets,
  teamEras,
} from '@blood-bowl-tracker/db';
import type { TableCell, TableRow } from '@blood-bowl-tracker/review-harness';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';

import type { SampledPlayer } from '../shared/review.types';
import type { CharacteristicFormat } from './characteristic-format.service';
import { CharacteristicFormatService } from './characteristic-format.service';

/** One characteristics line: the player's own, or a position baseline. */
interface Line {
  move: number | null;
  strength: number | null;
  agility: number | null;
  passing: number | null;
  armour: number | null;
}

/** The five display formats of the resolved rules set, in column order. */
type Formats = [
  CharacteristicFormat,
  CharacteristicFormat,
  CharacteristicFormat,
  CharacteristicFormat,
  CharacteristicFormat,
];

const HEADERS = ['Row', 'MA', 'ST', 'AG', 'PA', 'AV'];
const INCREASED = '▲';
const DECREASED = '▼';

/**
 * What the importers stored for this player, against the baseline their
 * position carries under the rules set their era resolves to.
 *
 * **Baseline resolution.** `players` carries no rules-set id, and
 * `era_rules_sets` is many-to-many, so the era's *last-listed* rules set is
 * taken — `order by era_rules_sets.id desc limit 1`. Rows are inserted in the
 * order the importers' own configs list them, so descending id recovers what
 * those importers mean by "last-listed" without this tool depending on
 * tools/import-bbl or tools/import-tp, which it must not. It is an
 * insertion-order heuristic, accepted deliberately: the alternative (a
 * baseline row per rules set the era maps to) buys accuracy this
 * single-player comparison does not need.
 *
 * **The comparison** is numeric and runs on the raw values, before
 * formatting, so a value moving to or from a real 0 still gets its marker
 * even though the cell shows a dash. Numeric, not "better/worse": under
 * BB2020 a lower Agility is a better Agility, and deciding which is which is
 * the reviewer's job, not this panel's. Passing is compared null-safely —
 * both sides null is unchanged; one side null and the other not is a change.
 *
 * A player with no baseline row gets a highlighted "missing" row and no
 * comparison at all: there is nothing to compare against, and the absence is
 * itself what the reviewer needs to see. Every highlighted row also carries
 * its state in words ("missing", "Player (changed)"), so the report stays
 * readable without colour.
 */
@Injectable()
export class PlayerCharacteristicsDbRendererService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly formats: CharacteristicFormatService,
    private readonly html: HtmlService,
  ) {}

  async render(player: SampledPlayer): Promise<string> {
    const stored = await this.storedPlayer(player.playerId);
    if (stored === undefined) {
      return this.html.note(
        `No player row with id ${player.playerId} in the database.`,
      );
    }
    const rulesSet = await this.rulesSetFor(stored.eraId);
    if (rulesSet === undefined) {
      return this.html.note(
        `Era "${player.eraName}" maps to no rules set, so there is no ` +
          'baseline to compare against.',
      );
    }
    const formats: Formats = [
      rulesSet.moveFormat,
      rulesSet.strengthFormat,
      rulesSet.agilityFormat,
      rulesSet.passingFormat,
      rulesSet.armourFormat,
    ];
    const baseline = await this.baselineFor(
      stored.positionId,
      rulesSet.rulesSetId,
    );
    const label = `Position baseline (${rulesSet.rulesSetName})`;
    if (baseline === undefined) {
      return this.html.table(HEADERS, [
        this.html.highlight([
          label,
          'missing',
          'missing',
          'missing',
          'missing',
          'missing',
        ]),
        ['Player', ...this.formatted(stored, formats)],
      ]);
    }
    return this.html.table(HEADERS, [
      [label, ...this.formatted(baseline, formats)],
      this.playerRow({ player: stored, baseline, formats }),
    ]);
  }

  /** The player's row, with the markers their diff from the baseline earns. */
  private playerRow(input: {
    player: Line;
    baseline: Line;
    formats: Formats;
  }): TableRow {
    const { player, baseline, formats } = input;
    const values = this.values(player);
    const baselineValues = this.values(baseline);
    let changed = false;
    const cells = values.map((value, index) => {
      const marker = this.marker(value, baselineValues[index]);
      const text = this.formats.format(value, formats[index]);
      if (marker === '') {
        return text;
      }
      changed = true;
      return `${text} ${marker}`;
    });
    return changed
      ? this.html.highlight(['Player (changed)', ...cells])
      : ['Player (unchanged)', ...cells];
  }

  /**
   * One cell's marker. Null on one side only counts as a change and takes its
   * direction from which side has the value: a characteristic the player has
   * and the baseline does not reads as an increase, and the reverse as a
   * decrease.
   */
  private marker(value: number | null, baseline: number | null): string {
    if (value === baseline) {
      return '';
    }
    if (value === null) {
      return DECREASED;
    }
    if (baseline === null) {
      return INCREASED;
    }
    return value > baseline ? INCREASED : DECREASED;
  }

  private formatted(line: Line, formats: Formats): TableCell[] {
    return this.values(line).map((value, index) =>
      this.formats.format(value, formats[index]),
    );
  }

  private values(line: Line): (number | null)[] {
    return [line.move, line.strength, line.agility, line.passing, line.armour];
  }

  private async storedPlayer(playerId: number) {
    const rows = await this.db
      .select({
        move: players.move,
        strength: players.strength,
        agility: players.agility,
        passing: players.passing,
        armour: players.armour,
        positionId: players.positionId,
        eraId: teamEras.eraId,
      })
      .from(players)
      .innerJoin(teamEras, eq(teamEras.id, players.teamEraId))
      .where(eq(players.id, playerId));
    return rows[0];
  }

  private async rulesSetFor(eraId: number) {
    const rows = await this.db
      .select({
        rulesSetId: rulesSets.id,
        rulesSetName: rulesSets.name,
        moveFormat: rulesSets.moveFormat,
        strengthFormat: rulesSets.strengthFormat,
        agilityFormat: rulesSets.agilityFormat,
        passingFormat: rulesSets.passingFormat,
        armourFormat: rulesSets.armourFormat,
      })
      .from(eraRulesSets)
      .innerJoin(rulesSets, eq(rulesSets.id, eraRulesSets.rulesSetId))
      .where(eq(eraRulesSets.eraId, eraId))
      .orderBy(desc(eraRulesSets.id))
      .limit(1);
    return rows[0];
  }

  private async baselineFor(positionId: number, rulesSetId: number) {
    const rows = await this.db
      .select({
        move: positionRulesSets.move,
        strength: positionRulesSets.strength,
        agility: positionRulesSets.agility,
        passing: positionRulesSets.passing,
        armour: positionRulesSets.armour,
      })
      .from(positionRulesSets)
      .where(
        and(
          eq(positionRulesSets.positionId, positionId),
          eq(positionRulesSets.rulesSetId, rulesSetId),
        ),
      );
    return rows[0];
  }
}
