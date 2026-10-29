import type {
  ImportError,
  PositionRulesSetSkillCategoriesEntry,
} from '@blood-bowl-tracker/api-contract';
import { PositionRulesSetSkillCategoriesService } from '@blood-bowl-tracker/game-data';
import { UpsertRecorderService } from '@blood-bowl-tracker/import-shared';
import { Injectable } from '@nestjs/common';

import type { TpOfficialBatchGroup } from './tp-official-batch-sync.service';
import { TpOfficialBatchSyncService } from './tp-official-batch-sync.service';
import type { TpOfficialPositionSlot } from './tp-official-positions-upsert.service';
import type { TpOfficialTeamsContext } from './tp-official-teams-context.service';

/** Options for {@link TpOfficialSkillCategoriesSyncService.syncSkillCategories}. */
export interface SyncOfficialSkillCategoriesOptions {
  slots: TpOfficialPositionSlot[];
  context: TpOfficialTeamsContext;
  errors: ImportError[];
}

@Injectable()
export class TpOfficialSkillCategoriesSyncService {
  constructor(
    private readonly skillCategories: PositionRulesSetSkillCategoriesService,
    private readonly batchSync: TpOfficialBatchSyncService,
    private readonly runner: UpsertRecorderService,
  ) {}

  /**
   * Writes each position's primary and secondary skill categories under the
   * rules set as its complete set, so a category TP stops listing is flagged
   * removed. A star's empty set is written too, recording that the star
   * takes no categories.
   *
   * A position whose categories the parser flagged as corrupt is reported
   * and skipped entirely: writing its empty set would mark its existing
   * categories removed. Every other position goes in one sync call. The
   * server rejects a batch all-or-nothing (including a position with no
   * characteristics row), so a rejected batch is retried one position at a
   * time. Returns how many positions were written.
   */
  syncSkillCategories({
    slots,
    context,
    errors,
  }: SyncOfficialSkillCategoriesOptions): Promise<number> {
    const groups: TpOfficialBatchGroup<PositionRulesSetSkillCategoriesEntry>[] =
      [];
    for (const slot of slots) {
      const item = { positionId: slot.positionId, rulesSet: context.rulesSet };
      if (slot.skillCategoriesError !== undefined) {
        errors.push({
          item,
          message: `Skipping the skill categories of position "${slot.name}" (${context.rulesSet}): ${slot.skillCategoriesError}`,
        });
        continue;
      }
      groups.push({
        entries: [
          {
            positionId: slot.positionId,
            rulesSetId: context.rulesSetId,
            primary: slot.skillCategories.primary,
            secondary: slot.skillCategories.secondary,
          },
        ],
        item,
        buildErrorMessage: (error) =>
          `Failed to write the skill categories of position "${slot.name}" (${context.rulesSet}): ${this.runner.messageOf(error)}`,
      });
    }
    return this.batchSync.syncGroups({
      groups,
      sync: (entries) => this.skillCategories.sync({ entries }),
      errors,
    });
  }
}
