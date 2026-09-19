import type {
  PositionRulesSetEntry,
  RulesSet,
} from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ImportResultService,
  PositionRulesSetsImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

import { CharacteristicNotationConversionService } from '../shared/characteristic-notation-conversion.service';
import type { BblPositionCharacteristics } from './position-page-parser';

export interface SyncPositionCharacteristicsOptions {
  /** Which rules sets each position was determined available under. */
  rulesSetIdsByPositionId: Map<number, Set<number>>;
  /** The raw characteristics line scraped from each position's page. */
  characteristicsByPositionId: Map<number, BblPositionCharacteristics>;
  /** Every upserted rules set, for its declared passingFormat. */
  rulesSetsByName: Map<string, RulesSet>;
}

/**
 * Writes each position's characteristics under every rules set it played
 * under — except the rules sets BBL cannot describe at all.
 *
 * BBL is a single BB2020-era snapshot, so Agility and Armour are rewritten
 * per rules set into the notation that rules set declares. For the rules sets
 * that state them as bare numbers (CRP, CRP+ and BB2016 — everything before
 * BB2020) that rewrite is not enough to make the snapshot true: the notation
 * conversion is lossy, and, worse, no conversion recovers Move and Strength,
 * which genuinely differed between editions for some positions. So those
 * rules sets are skipped outright: BBL writes no position_rules_sets row for
 * them at all, rather than a guess that something reading the table back
 * mid-pipeline would believe. Their values come only from the hand-curated
 * after-other-importers/position-characteristics.json5 in tools/import-manual.
 *
 * `agilityFormat === 'bare'` is the data-driven signal for exactly those
 * three: it is curated in tools/import-manual's *before* phase, so it is
 * already stored by the time BBL runs, and it is the same signal
 * CharacteristicNotationConversionService keys its conversion on — no list of
 * "old" rules sets has to be maintained here either.
 *
 * BBL-local rather than shared: the era -> rules-set resolution feeding it is
 * BBL's own. The shared piece is PositionRulesSetsImportService, which this
 * consumes unchanged.
 */
@Injectable()
export class BblPositionCharacteristicsImportService {
  constructor(
    private readonly positionRulesSetsImport: PositionRulesSetsImportService,
    private readonly importResults: ImportResultService,
    private readonly notationConversion: CharacteristicNotationConversionService,
  ) {}

  /**
   * One sync call per position. The shared sync validates and writes a whole
   * batch all-or-nothing, so batching per position keeps one bad position's
   * characteristics from rejecting every other position's.
   */
  async syncPositionCharacteristics({
    rulesSetIdsByPositionId,
    characteristicsByPositionId,
    rulesSetsByName,
  }: SyncPositionCharacteristicsOptions): Promise<{ result: ImportResult }> {
    let imported = 0;
    const errors: ImportError[] = [];

    const rulesSetsById = new Map<number, RulesSet>();
    for (const rulesSet of rulesSetsByName.values()) {
      rulesSetsById.set(rulesSet.id, rulesSet);
    }

    for (const [positionId, rulesSetIds] of rulesSetIdsByPositionId) {
      const characteristics = characteristicsByPositionId.get(positionId);
      if (!characteristics) {
        // The parse failure already recorded an error in the positions step;
        // there is nothing new to report here.
        continue;
      }

      // Rules sets that state Agility and Armour as bare numbers are exactly
      // the pre-BB2020 ones (CRP, CRP+, BB2016), and BBL has nothing
      // trustworthy to say about them — see this class's doc comment. An
      // unresolvable rules set is deliberately kept: nothing here can tell
      // whether it is one of those three.
      const writableRulesSetIds = [...rulesSetIds].filter(
        (rulesSetId) => rulesSetsById.get(rulesSetId)?.agilityFormat !== 'bare',
      );

      const entries: PositionRulesSetEntry[] = writableRulesSetIds.map(
        (rulesSetId) => {
          const rulesSet = rulesSetsById.get(rulesSetId);
          return {
            positionId,
            rulesSetId,
            move: characteristics.move,
            strength: characteristics.strength,
            // Every rules set left here is non-bare, so these two conversions
            // are no-ops today. They stay because it is the target rules
            // set's own declared notation — not this call site — that decides
            // notation. `?? 'plus'` mirrors the passingFormat check below: an
            // unresolvable rules set converts nothing, which is the
            // pre-existing behaviour.
            agility: this.notationConversion.convertAgility(
              characteristics.agility,
              rulesSet?.agilityFormat ?? 'plus',
            ),
            // Two distinct states: a rules set with no Passing concept at
            // all stores null, while a rules set that has Passing stores 0
            // for a position that cannot pass (the page's "-").
            passing:
              rulesSet?.passingFormat === 'absent'
                ? null
                : (characteristics.passing ?? 0),
            armour: this.notationConversion.convertArmour(
              characteristics.armour,
              rulesSet?.armourFormat ?? 'plus',
            ),
          };
        },
      );
      if (entries.length === 0) {
        continue;
      }

      const result = await this.positionRulesSetsImport.syncPositionRulesSets(
        { entries },
        errors,
      );
      if (result) {
        imported += entries.length;
      }
    }

    return { result: this.importResults.result({ imported, errors }) };
  }
}
