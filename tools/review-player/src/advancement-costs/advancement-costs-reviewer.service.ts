import { Injectable } from '@nestjs/common';

import type { PlayerDataTypeReviewer } from '../shared/data-type-reviewer';
import type { SampledPlayer } from '../shared/review.types';
import { AdvancementCostsDbRendererService } from './advancement-costs-db-renderer.service';
import { BblAdvancementCostsRawRendererService } from './bbl-advancement-costs-raw-renderer.service';
import { TpAdvancementCostsRawRendererService } from './tp-advancement-costs-raw-renderer.service';

/**
 * The advancement-costs data type: the source's own unspent figure and
 * gained skills on the left, each stored advancement's modelled cost and the
 * modelled unspent range on the right.
 */
@Injectable()
export class AdvancementCostsReviewerService implements PlayerDataTypeReviewer {
  readonly id = 'advancement-costs';

  constructor(
    private readonly bblRaw: BblAdvancementCostsRawRendererService,
    private readonly tpRaw: TpAdvancementCostsRawRendererService,
    private readonly imported: AdvancementCostsDbRendererService,
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
