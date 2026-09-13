import type { ImportError } from '@blood-bowl-tracker/import';
import {
  ImportResultService,
  PositionRulesSetsImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import type { EraDataConfig } from '../eras/era-data-config.service';
import type { TpPlayerCharacteristicsPayload } from './tp-player-characteristics-builder.service';

/**
 * One mercenary position's characteristics under one rules set. Deliberately
 * the same five fields (and only those) that `position_rules_sets` and a
 * player's own characteristics both carry.
 */
export interface MercenaryCharacteristics {
  move: number;
  strength: number;
  agility: number;
  passing: number;
  armour: number;
}

/**
 * Supplies the characteristics for a mercenary ("Big Guy") hire, which TP's
 * own data leaves empty everywhere: the name appears in no roster catalog
 * (`lineUpMasters`, `starPlayersMasters`), and the match-embedded `lineUps[]`
 * entry for an actual hire carries no `ma/st/ag/pa/av` either.
 *
 * The values come from the curated `position_rules_sets` row that
 * tools/import-manual writes in its BEFORE-other-importers phase
 * (`data/before-other-importers/position-characteristics-gap-fill.json5`), read
 * back over the API. That row is a genuine gap-fill entry -- no source
 * importer can produce one for a mercenary position -- so it is guaranteed to
 * exist by the time this importer runs, and reading it is what lets this tool
 * hold no second, hand-duplicated copy of the same numbers.
 *
 * Split out of `TpPlayersImportService` (which only calls the three methods
 * below) both to keep that file under the repo's source-file line cap and
 * because every "this mercenary is not curated" error message belongs in one
 * place. Every path that leaves a mercenary without characteristics records an
 * `ImportError`, so a missing curation shows up in the import run's result
 * instead of silently landing on `players`' illegal `DEFAULT 0` placeholder.
 */
@Injectable()
export class TpMercenaryCharacteristicsService {
  /**
   * Mercenary position name -> rules set id -> characteristics, filled by
   * `loadPositionCharacteristics` and read by `forRosterPlayer`. One entry per
   * distinct mercenary name per import run: the position's rows are read once,
   * not once per hire.
   */
  private readonly byPositionName = new Map<
    string,
    Map<number, MercenaryCharacteristics>
  >();

  constructor(
    private readonly positionRulesSetsImport: PositionRulesSetsImportService,
    private readonly importResults: ImportResultService,
  ) {}

  /**
   * Era name -> its single rules set's NAME, from the era config. Only the
   * per-hire error message needs the name (the lookup itself is by rules set
   * id), but the players importer has to carry it from the era config either
   * way. An era declaring anything other than exactly one rules set is
   * skipped here silently: the resolver has already recorded its own error for
   * it, and the caller then simply passes `rulesSet: undefined`.
   */
  rulesSetNameByEraName(eras: EraDataConfig[]): Map<string, string> {
    const byEraName = new Map<string, string>();
    for (const era of eras) {
      if (era.rulesSets.length === 1) {
        byEraName.set(era.name, era.rulesSets[0]);
      }
    }
    return byEraName;
  }

  /**
   * Read one mercenary Position's curated `position_rules_sets` rows and cache
   * them for this run's hires. Call once per distinct mercenary name per
   * import run.
   *
   * A position with no rows at all means nobody has curated this mercenary
   * yet, which is an error: a brand-new mercenary name showed up in the source
   * data. A failed read records nothing extra -- `listPositionRulesSets`
   * already recorded its own error. A row whose `passing` is null cannot be
   * used for a hire (an `UpsertPlayer` payload has no way to express "no
   * Passing"), so it is reported and left out of the cache rather than
   * surfacing later as a misleading per-hire "not curated".
   */
  async loadPositionCharacteristics(options: {
    positionName: string;
    positionId: number;
    errors: ImportError[];
  }): Promise<void> {
    const { positionName, positionId, errors } = options;
    const rows = await this.positionRulesSetsImport.listPositionRulesSets(
      positionId,
      errors,
    );
    if (rows === undefined) {
      return;
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
      return;
    }

    const byRulesSetId = new Map<number, MercenaryCharacteristics>();
    for (const row of rows) {
      if (row.passing === null) {
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
    this.byPositionName.set(positionName, byRulesSetId);
  }

  /**
   * One mercenary hire's own characteristics, from the rows
   * `loadPositionCharacteristics` cached, shaped exactly like
   * `TpPlayerCharacteristicsBuilderService`'s return value so the caller can
   * spread either into the same upsert payload. Returns `undefined`
   * (recording an error naming the position, rules set and hire) when no row
   * covers that specific rules set -- the player row is still created, just
   * without characteristics, and the gap is visible in the import result. A
   * `rulesSet` of `undefined` (the era resolved to no single rules set)
   * returns `undefined` silently: the era resolver already recorded that
   * problem, and duplicating it per hire would only add noise.
   */
  forRosterPlayer(options: {
    positionName: string;
    player: { id: number; name: string };
    rulesSet: { name: string; id: number } | undefined;
    errors: ImportError[];
  }): TpPlayerCharacteristicsPayload | undefined {
    const { positionName, player, rulesSet, errors } = options;
    if (rulesSet === undefined) {
      return undefined;
    }
    const characteristics = this.byPositionName
      .get(positionName)
      ?.get(rulesSet.id);
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
