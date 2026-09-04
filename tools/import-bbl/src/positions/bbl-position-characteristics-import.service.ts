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
 * under. BBL is a single BB2020-era snapshot, so Agility and Armour are
 * rewritten per rules set into the notation that rules set declares — one
 * scraped line can therefore produce different stored values per rules set.
 * Curated pre-BB2020 values are imported separately afterwards and overwrite
 * these.
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

      const entries: PositionRulesSetEntry[] = [...rulesSetIds].map(
        (rulesSetId) => ({
          positionId,
          rulesSetId,
          move: characteristics.move,
          strength: characteristics.strength,
          // BBL only ever shows BB2020 notation, so a rules set that writes
          // bare numbers needs these two rewritten. `?? 'plus'` mirrors the
          // passingFormat lookup below: an unresolvable rules set converts
          // nothing, which is the pre-existing behaviour.
          agility: this.notationConversion.convertAgility(
            characteristics.agility,
            rulesSetsById.get(rulesSetId)?.agilityFormat ?? 'plus',
          ),
          // Two distinct states: a rules set with no Passing concept at all
          // stores null, while a rules set that has Passing stores 0 for a
          // position that cannot pass (the page's "-").
          passing:
            rulesSetsById.get(rulesSetId)?.passingFormat === 'absent'
              ? null
              : (characteristics.passing ?? 0),
          armour: this.notationConversion.convertArmour(
            characteristics.armour,
            rulesSetsById.get(rulesSetId)?.armourFormat ?? 'plus',
          ),
        }),
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
