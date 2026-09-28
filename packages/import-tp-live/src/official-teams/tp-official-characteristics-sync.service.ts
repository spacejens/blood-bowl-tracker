import type {
  ImportError,
  TpOfficialPositionCharacteristics,
} from '@blood-bowl-tracker/api-contract';
import { PositionRulesSetsService } from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';

import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import type { TpOfficialBatchGroup } from './tp-official-batch-sync.service';
import { TpOfficialBatchSyncService } from './tp-official-batch-sync.service';
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
    private readonly batchSync: TpOfficialBatchSyncService,
    private readonly runner: TpUpsertRunnerService,
  ) {}

  /**
   * Writes each position's characteristics under the rules set. TP's list is
   * per rules set at the source and official-vs-legacy precedence was already
   * decided by the positions step, so nothing here reconciles. Every position
   * goes in one sync call; the shared sync validates it all-or-nothing
   * against the rules set's declared formats, so a rejected batch is retried
   * one position at a time and one bad position never costs the others
   * theirs. Every rules set TP covers has a Passing characteristic, so
   * `passing` is TP's plain number (0 meaning "cannot pass").
   */
  async syncCharacteristics({
    slots,
    context,
    errors,
  }: SyncOfficialCharacteristicsOptions): Promise<SyncedOfficialCharacteristics> {
    const groups: TpOfficialBatchGroup<TpOfficialPositionCharacteristics>[] =
      slots.map((slot) => ({
        entries: [
          {
            positionId: slot.positionId,
            rulesSetId: context.rulesSetId,
            ...slot.characteristics,
          },
        ],
        item: { positionId: slot.positionId, rulesSet: context.rulesSet },
        buildErrorMessage: (error) =>
          `Failed to write the characteristics of position "${slot.name}" (${context.rulesSet}): ${this.runner.messageOf(error)}`,
      }));
    const imported = await this.batchSync.syncGroups({
      groups,
      sync: (entries) => this.positionRulesSets.sync({ entries }),
      errors,
    });
    return {
      imported,
      positionCharacteristics: groups.flatMap((group) => group.entries),
    };
  }
}
