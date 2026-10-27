import { Injectable } from '@nestjs/common';

import type { PlayerDataTypeReviewer } from '../shared/data-type-reviewer';
import type { SampledPlayer } from '../shared/review.types';
import { BblPlayerStatusRawRendererService } from './bbl-player-status-raw-renderer.service';
import { PlayerStatusDbRendererService } from './player-status-db-renderer.service';
import { TpPlayerStatusRawRendererService } from './tp-player-status-raw-renderer.service';

/**
 * The player-status data type's entry point into the report harness: raw
 * panel from whichever source the player was sampled through, imported panel
 * from the database. Shaped like `LastingInjuriesReviewerService` — the
 * harness's default raw/imported panel wording fits, since the left panel
 * really is a raw source.
 */
@Injectable()
export class PlayerStatusReviewerService implements PlayerDataTypeReviewer {
  readonly id = 'player-status';

  constructor(
    private readonly bblRaw: BblPlayerStatusRawRendererService,
    private readonly tpRaw: TpPlayerStatusRawRendererService,
    private readonly imported: PlayerStatusDbRendererService,
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
