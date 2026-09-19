import { Injectable } from '@nestjs/common';

import type { PlayerDataTypeReviewer } from '../shared/data-type-reviewer';
import type { SampledPlayer } from '../shared/review.types';
import { BblPlayerAdvancementsRawRendererService } from './bbl-player-advancements-raw-renderer.service';
import { PlayerAdvancementsDbRendererService } from './player-advancements-db-renderer.service';
import { TpPlayerAdvancementsRawRendererService } from './tp-player-advancements-raw-renderer.service';

/**
 * The player-advancements data type: raw panel from whichever source the
 * player was sampled through, imported panel from the database. Starting
 * skills are shown alongside gained ones on both sides, because a gained
 * skill only makes sense against the set the player started with.
 */
@Injectable()
export class PlayerAdvancementsReviewerService implements PlayerDataTypeReviewer {
  readonly id = 'player-advancements';

  constructor(
    private readonly bblRaw: BblPlayerAdvancementsRawRendererService,
    private readonly tpRaw: TpPlayerAdvancementsRawRendererService,
    private readonly imported: PlayerAdvancementsDbRendererService,
  ) {}

  getRawSource(player: SampledPlayer): Promise<string> {
    return player.source === 'bbl'
      ? this.bblRaw.render(player.externalId)
      : this.tpRaw.render(player.externalId);
  }

  getImportedView(player: SampledPlayer): Promise<string> {
    return this.imported.render(player);
  }
}
