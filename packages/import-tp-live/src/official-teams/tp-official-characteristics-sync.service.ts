import type {
  ImportError,
  TpOfficialPositionCharacteristics,
} from '@blood-bowl-tracker/api-contract';
import { PositionRulesSetsService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';

import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import type { TpOfficialPositionSlot } from './tp-official-positions-upsert.service';
import type { TpOfficialTeamsContext } from './tp-official-teams-context.service';

/** Options for {@link TpOfficialCharacteristicsSyncService.syncCharacteristics}. */
export interface SyncOfficialCharacteristicsOptions {
  slots: TpOfficialPositionSlot[];
  context: TpOfficialTeamsContext;
  errors: ImportError[];
}

/** What writing one rules set's characteristics did. */
export interface SyncedOfficialCharacteristics {
  imported: number;
  /** Every position's characteristics under the rules set, as TP lists them. */
  positionCharacteristics: TpOfficialPositionCharacteristics[];
}

@Injectable()
export class TpOfficialCharacteristicsSyncService {
  constructor(
    private readonly positionRulesSets: PositionRulesSetsService,
    private readonly runner: TpUpsertRunnerService,
  ) {}

  /**
   * Writes each position's characteristics under the rules set. TP's list is
   * per rules set at the source and official-vs-legacy precedence was already
   * decided by the positions step, so nothing here reconciles. One sync call
   * per position: the shared sync validates a batch all-or-nothing against
   * the rules set's declared formats, so one bad position never costs the
   * others theirs. Every rules set TP covers has a Passing characteristic, so
   * `passing` is TP's plain number (0 meaning "cannot pass").
   */
  async syncCharacteristics({
    slots,
    context,
    errors,
  }: SyncOfficialCharacteristicsOptions): Promise<SyncedOfficialCharacteristics> {
    let imported = 0;
    const positionCharacteristics: TpOfficialPositionCharacteristics[] = [];
    for (const slot of slots) {
      const entry: TpOfficialPositionCharacteristics = {
        positionId: slot.positionId,
        rulesSetId: context.rulesSetId,
        ...slot.characteristics,
      };
      positionCharacteristics.push(entry);
      const synced = await this.runner.record({
        run: () => this.positionRulesSets.sync({ entries: [entry] }),
        item: { positionId: slot.positionId, rulesSet: context.rulesSet },
        errors,
        buildErrorMessage: (error) =>
          `Failed to write the characteristics of position "${slot.name}" (${context.rulesSet}): ${this.runner.messageOf(error)}`,
      });
      if (synced !== undefined) {
        imported += 1;
      }
    }
    return { imported, positionCharacteristics };
  }
}
