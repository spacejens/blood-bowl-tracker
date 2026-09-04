import { Injectable } from '@nestjs/common';

import type { PlayerDataTypeReviewer } from '../shared/data-type-reviewer';
import type { SampledPlayer } from '../shared/review.types';
import { BblPlayerCharacteristicsRawRendererService } from './bbl-player-characteristics-raw-renderer.service';
import { PlayerCharacteristicsDbRendererService } from './player-characteristics-db-renderer.service';
import { TpPlayerCharacteristicsRawRendererService } from './tp-player-characteristics-raw-renderer.service';

/**
 * The player-characteristics data type's entry point into the report harness:
 * raw panel from whichever source the player was sampled through, imported
 * panel from the database. Shaped exactly like `PlayerInfoReviewerService` —
 * the harness's default raw/imported panel wording is right here, since the
 * left panel really is a raw source.
 */
@Injectable()
export class PlayerCharacteristicsReviewerService implements PlayerDataTypeReviewer {
  readonly id = 'player-characteristics';

  constructor(
    private readonly bblRaw: BblPlayerCharacteristicsRawRendererService,
    private readonly tpRaw: TpPlayerCharacteristicsRawRendererService,
    private readonly imported: PlayerCharacteristicsDbRendererService,
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
