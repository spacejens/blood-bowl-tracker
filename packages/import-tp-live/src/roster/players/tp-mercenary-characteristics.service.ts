import type { ImportError } from '@blood-bowl-tracker/api-contract';
import { PositionRulesSetsService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';

import { TpImportResultsService } from '../../tp-import-results.service';
import { TpUpsertRunnerService } from '../../tp-upsert-runner.service';
import type { TpPlayerCharacteristicsPayload } from './tp-player-characteristics-builder.service';

/** One mercenary position's characteristics under one rules set. */
export interface MercenaryCharacteristics {
  move: number;
  strength: number;
  agility: number;
  passing: number;
  armour: number;
}

/**
 * One mercenary position's curated rows, as read for one import. `loaded:
 * false` means the read failed or found no rows — already reported once, so
 * its hires add no per-hire error. A rules set in `rejectedRulesSetIds` had
 * a row with no Passing value, also already reported.
 */
export type MercenaryCurated =
  | { loaded: false }
  | {
      loaded: true;
      byRulesSetId: Map<number, MercenaryCharacteristics>;
      rejectedRulesSetIds: Set<number>;
    };

/**
 * Supplies the characteristics for a mercenary ("Big Guy") hire, which TP's
 * own data leaves empty everywhere: the name appears in no roster catalog,
 * and the `lineUps[]` entry for an actual hire carries no `ma/st/ag/pa/av`.
 * The values come from the curated `position_rules_sets` row that
 * tools/import-manual writes in its before-other-importers phase
 * (`data/before-other-importers/position-characteristics-gap-fill.json5`),
 * read straight from the database, so no second copy of the numbers exists.
 *
 * Holds no state between calls: this runs inside long-lived processes
 * (api-server, the Discord bot), so a cache that outlived one import would
 * go stale. The players import keeps each position's `MercenaryCurated` for
 * the length of one import and passes it back in.
 */
@Injectable()
export class TpMercenaryCharacteristicsService {
  constructor(
    private readonly positionRulesSets: PositionRulesSetsService,
    private readonly importResults: TpImportResultsService,
    private readonly runner: TpUpsertRunnerService,
  ) {}

  /**
   * Reads one mercenary position's curated rows. A position with no rows at
   * all means nobody has curated this mercenary yet — an error, since a
   * brand-new mercenary name showed up in the source data. A row whose
   * `passing` is null cannot be used for a hire (a player row cannot express
   * "no Passing"), so it is reported and left out.
   */
  async loadPositionCharacteristics(options: {
    positionName: string;
    positionId: number;
    errors: ImportError[];
  }): Promise<MercenaryCurated> {
    const { positionName, positionId, errors } = options;
    const rows = await this.runner.record({
      run: () => this.positionRulesSets.listByPosition(positionId),
      item: { positionRulesSets: positionId },
      errors,
      buildErrorMessage: (error) =>
        `Failed to list characteristics for position ${positionId}: ${this.runner.messageOf(error)}`,
    });
    if (rows === undefined) {
      return { loaded: false };
    }
    if (rows.length === 0) {
      errors.push(
        this.importResults.error({
          item: { position: positionName },
          message:
            `Could not resolve curated characteristics for mercenary ` +
            `position "${positionName}": it has no position_rules_sets row ` +
            'at all. Curate one in tools/import-manual so its hires get ' +
            'real values.',
        }),
      );
      return { loaded: false };
    }

    const byRulesSetId = new Map<number, MercenaryCharacteristics>();
    const rejectedRulesSetIds = new Set<number>();
    for (const row of rows) {
      if (row.passing === null) {
        rejectedRulesSetIds.add(row.rulesSetId);
        errors.push(
          this.importResults.error({
            item: { position: positionName, rulesSet: row.rulesSetId },
            message:
              `Mercenary position "${positionName}" has a curated row for ` +
              `rules set ${row.rulesSetId} with no Passing value, which a ` +
              'player row cannot express; its hires under that rules set are ' +
              'imported without characteristics.',
          }),
        );
        continue;
      }
      byRulesSetId.set(row.rulesSetId, {
        move: row.move,
        strength: row.strength,
        agility: row.agility,
        passing: row.passing,
        armour: row.armour,
      });
    }
    return { loaded: true, byRulesSetId, rejectedRulesSetIds };
  }

  /**
   * One mercenary hire's characteristics from its position's curated rows,
   * shaped like TpPlayerCharacteristicsBuilderService's payload. Undefined,
   * with one error, when no row covers the hire's rules set; undefined with
   * no error of its own when that gap was already reported (a failed or
   * empty read, or a rejected rules set) or the era declares no single rules
   * set (reported by the roster context).
   */
  forRosterPlayer(options: {
    curated: MercenaryCurated;
    positionName: string;
    player: { id: number; name: string };
    rulesSet: { id: number; name: string } | undefined;
    errors: ImportError[];
  }): TpPlayerCharacteristicsPayload | undefined {
    const { curated, positionName, player, rulesSet, errors } = options;
    if (
      rulesSet === undefined ||
      !curated.loaded ||
      curated.rejectedRulesSetIds.has(rulesSet.id)
    ) {
      return undefined;
    }
    const characteristics = curated.byRulesSetId.get(rulesSet.id);
    if (characteristics === undefined) {
      errors.push(
        this.importResults.error({
          item: {
            player: player.id,
            position: positionName,
            rulesSet: rulesSet.name,
          },
          message:
            `Imported mercenary hire "${player.name}" (${player.id}) without ` +
            `characteristics: mercenary position "${positionName}" has no ` +
            `curated entry for rules set "${rulesSet.name}".`,
        }),
      );
      return undefined;
    }
    return { ...characteristics, rulesSetId: rulesSet.id };
  }
}
