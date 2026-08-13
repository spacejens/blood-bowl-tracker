import { Injectable } from '@nestjs/common';

import type { PlayerDataTypeReviewer } from '../shared/data-type-reviewer';
import type { SampledPlayer } from '../shared/review.types';
import { PlayerSppComputedRendererService } from './player-spp-computed-renderer.service';
import { PlayerSppImportedRendererService } from './player-spp-imported-renderer.service';
import { PlayerSppLookupService } from './player-spp-lookup.service';

/**
 * The spp-totals data type for one player. Both panels are database-derived —
 * the left one is what this tool recomputes from match events, the right one
 * is what an importer stored — so the reviewer names its own panels rather
 * than using the harness's raw/imported wording.
 */
@Injectable()
export class PlayerSppTotalsReviewerService implements PlayerDataTypeReviewer {
  readonly id = 'spp-totals';
  readonly rawPanelLabel = 'Computed from match events (database)';
  readonly importedPanelLabel = 'Stored player totals (database)';

  constructor(
    private readonly lookup: PlayerSppLookupService,
    private readonly computed: PlayerSppComputedRendererService,
    private readonly imported: PlayerSppImportedRendererService,
  ) {}

  async getRawSource(player: SampledPlayer): Promise<string> {
    return this.computed.render(await this.lookup.load(player));
  }

  async getImportedView(player: SampledPlayer): Promise<string> {
    return this.imported.render(await this.lookup.load(player));
  }
}
