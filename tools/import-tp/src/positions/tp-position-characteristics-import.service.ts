import type { PositionRulesSetEntry } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ImportResultService,
  PositionRulesSetsImportService,
} from '@blood-bowl-tracker/import';
import type { TpPositionCharacteristics } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

/**
 * Writes each position's characteristics under every rules set TP's rosters
 * reported it under. Unlike BBL — a single BB2020-form snapshot that has to be
 * written to older rules sets too — TP's data is per rules set at the source,
 * and every rules set TP covers (BB2020, DB2021, BB2025) has a Passing
 * characteristic, so `passing` is passed through as the plain number TP
 * supplies (0 meaning "cannot pass"), with no absent-vs-zero branching. A
 * mismatch against a rules set's declared formats would be rejected by the
 * shared PositionRulesSetsService validation server-side.
 *
 * TP-local rather than shared: the era -> rules-set resolution feeding it is
 * TP's own (see TpPositionsImportService). The shared piece is
 * PositionRulesSetsImportService, which this consumes unchanged.
 */
@Injectable()
export class TpPositionCharacteristicsImportService {
  constructor(
    private readonly positionRulesSetsImport: PositionRulesSetsImportService,
    private readonly importResults: ImportResultService,
  ) {}

  /**
   * One sync call per position. The shared sync validates and writes a whole
   * batch all-or-nothing, so batching per position keeps one bad position's
   * characteristics from rejecting every other position's.
   */
  async syncPositionCharacteristics(
    characteristicsByPositionId: Map<
      number,
      Map<number, TpPositionCharacteristics>
    >,
  ): Promise<{ result: ImportResult }> {
    let imported = 0;
    const errors: ImportError[] = [];

    for (const [
      positionId,
      characteristicsByRulesSetId,
    ] of characteristicsByPositionId) {
      const entries: PositionRulesSetEntry[] = [
        ...characteristicsByRulesSetId,
      ].map(([rulesSetId, characteristics]) => ({
        positionId,
        rulesSetId,
        move: characteristics.move,
        strength: characteristics.strength,
        agility: characteristics.agility,
        passing: characteristics.passing,
        armour: characteristics.armour,
      }));
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
