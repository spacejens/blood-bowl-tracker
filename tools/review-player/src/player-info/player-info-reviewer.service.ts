import { Injectable } from '@nestjs/common';

import type { PlayerDataTypeReviewer } from '../shared/data-type-reviewer';
import type { SampledPlayer } from '../shared/review.types';
import { BblPlayerInfoRawRendererService } from './bbl-player-info-raw-renderer.service';
import { PlayerInfoDbRendererService } from './player-info-db-renderer.service';
import { TpPlayerInfoRawRendererService } from './tp-player-info-raw-renderer.service';

/**
 * The player-info data type's entry point into the report harness: raw panel
 * from whichever source the player was sampled through, imported panel from
 * the database.
 */
@Injectable()
export class PlayerInfoReviewerService implements PlayerDataTypeReviewer {
  readonly id = 'player-info';

  constructor(
    private readonly bblRaw: BblPlayerInfoRawRendererService,
    private readonly tpRaw: TpPlayerInfoRawRendererService,
    private readonly imported: PlayerInfoDbRendererService,
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
