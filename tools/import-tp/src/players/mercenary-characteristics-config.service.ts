import { ConfigErrorMessageService } from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { ImportTpConfigService } from '../config/import-tp-config.service';
import {
  mercenaryCharacteristicsEntrySchema,
  mercenaryCharacteristicsShellSchema,
} from './mercenary-characteristics-config.schema';

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
 * Curated characteristics for mercenary ("Big Guy") hires, keyed by the
 * mercenary position's name (a TP `lineUps[]` entry's inline
 * `fallbackPositionName`) and then by rules-set name.
 *
 * TP supplies no characteristics for these hires anywhere: the name appears in
 * no roster catalog (`lineUpMasters`, `starPlayersMasters`), and the
 * match-embedded `lineUps[]` entry for an actual hire carries no
 * `ma/st/ag/pa/av` either. Without this table both the mercenary Position and
 * every hire of it would be left with no characteristics at all.
 *
 * Supplied via the top-level `mercenaryCharacteristics` setting in
 * import-tp-config.json5 -- the same config file (and the same "supply what
 * TP's data doesn't carry" role) `league.eras` already plays for rule sets and
 * dates. The committed `import-tp-config.example.json5` carries the real,
 * currently-known entries as its example value, so a developer copying it
 * starts with accurate data rather than a placeholder.
 *
 * Adding a rules set, or a newly-observed mercenary name, is one more entry in
 * the config -- no code change. A mercenary name with no entry at all, or
 * a hire under a rules set this table does not cover, is reported as an
 * `ImportError` by `TpMercenaryCharacteristicsService` rather than silently
 * importing without characteristics.
 */
@Injectable()
export class MercenaryCharacteristicsConfigService {
  constructor(
    private readonly config: ImportTpConfigService,
    private readonly messages: ConfigErrorMessageService,
  ) {}

  /**
   * Every curated rules set for one mercenary position, or `undefined` when
   * the position name is not curated at all -- the caller reports that as an
   * error, since it means a brand-new mercenary name showed up in the source
   * data and nobody has curated it yet.
   */
  forPosition(
    positionName: string,
  ): ReadonlyMap<string, MercenaryCharacteristics> | undefined {
    return this.readTable().get(positionName);
  }

  /**
   * One mercenary position's characteristics under one specific rules set, or
   * `undefined` when the table covers neither the position nor that particular
   * rules set for it.
   */
  forPositionAndRulesSet(options: {
    positionName: string;
    rulesSetName: string;
  }): MercenaryCharacteristics | undefined {
    return this.readTable()
      .get(options.positionName)
      ?.get(options.rulesSetName);
  }

  /**
   * Parses `mercenaryCharacteristics` from import-tp-config.json5 into
   * position name -> rules-set name -> characteristics. An absent setting is
   * valid (no mercenary hire curated yet) and yields an empty table.
   */
  private readTable(): Map<string, Map<string, MercenaryCharacteristics>> {
    const byPositionName = new Map<
      string,
      Map<string, MercenaryCharacteristics>
    >();
    const raw = this.config.get('mercenaryCharacteristics');
    if (raw === undefined) {
      return byPositionName;
    }

    const shell = mercenaryCharacteristicsShellSchema.safeParse(raw);
    if (!shell.success) {
      throw new Error(
        'mercenaryCharacteristics in import-tp-config.json5 must be an ' +
          'array of mercenary characteristics entries.',
      );
    }

    shell.data.forEach((entry, index) => {
      const parsed = mercenaryCharacteristicsEntrySchema.safeParse(entry);
      if (!parsed.success) {
        throw new Error(
          this.messages.format(
            `MERCENARY_CHARACTERISTICS[${index}]`,
            parsed.error,
          ),
        );
      }
      const { positionName, rulesSetName, ...characteristics } = parsed.data;
      let byRulesSetName = byPositionName.get(positionName);
      if (byRulesSetName === undefined) {
        byRulesSetName = new Map();
        byPositionName.set(positionName, byRulesSetName);
      }
      if (byRulesSetName.has(rulesSetName)) {
        throw new Error(
          `mercenaryCharacteristics: "${positionName}" under rules set ` +
            `"${rulesSetName}" appears more than once.`,
        );
      }
      byRulesSetName.set(rulesSetName, characteristics);
    });

    return byPositionName;
  }
}
