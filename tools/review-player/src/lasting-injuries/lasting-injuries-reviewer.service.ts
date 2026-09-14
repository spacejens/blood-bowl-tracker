import { Injectable } from '@nestjs/common';

import type { PlayerDataTypeReviewer } from '../shared/data-type-reviewer';
import type { SampledPlayer } from '../shared/review.types';
import { BblLastingInjuriesRawRendererService } from './bbl-lasting-injuries-raw-renderer.service';
import { LastingInjuriesDbRendererService } from './lasting-injuries-db-renderer.service';
import { TpLastingInjuriesRawRendererService } from './tp-lasting-injuries-raw-renderer.service';

/**
 * The lasting-injuries data type's entry point into the report harness: raw
 * panel from whichever source the player was sampled through, imported panel
 * from the database. Shaped exactly like `PlayerCharacteristicsReviewerService`
 * — the harness's default raw/imported panel wording is right here, since the
 * left panel really is a raw source.
 */
@Injectable()
export class LastingInjuriesReviewerService implements PlayerDataTypeReviewer {
  readonly id = 'lasting-injuries';

  constructor(
    private readonly bblRaw: BblLastingInjuriesRawRendererService,
    private readonly tpRaw: TpLastingInjuriesRawRendererService,
    private readonly imported: LastingInjuriesDbRendererService,
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
