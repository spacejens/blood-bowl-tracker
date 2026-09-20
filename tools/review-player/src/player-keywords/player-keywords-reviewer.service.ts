import { Injectable } from '@nestjs/common';

import type { PlayerDataTypeReviewer } from '../shared/data-type-reviewer';
import type { SampledPlayer } from '../shared/review.types';
import { PlayerKeywordsDbRendererService } from './player-keywords-db-renderer.service';
import { PlayerKeywordsRawRendererService } from './player-keywords-raw-renderer.service';

/**
 * The player-keywords data type: a player's keywords come from their
 * position, not a player-level TP field, so the raw panel reads TP's
 * template keyword codes for this player's line-up while the imported panel
 * reads what the database recorded for their *position*.
 *
 * Only TP publishes keyword codes at all -- BBL has no such concept -- so the
 * raw panel names TP and the curated catalogue rather than all three sources.
 */
@Injectable()
export class PlayerKeywordsReviewerService implements PlayerDataTypeReviewer {
  readonly id = 'player-keywords';
  readonly rawPanelLabel = 'Raw sources (TP template codes / manual curation)';
  readonly importedPanelLabel = 'Imported position keywords (database)';

  constructor(
    private readonly raw: PlayerKeywordsRawRendererService,
    private readonly imported: PlayerKeywordsDbRendererService,
  ) {}

  getRawSource(player: SampledPlayer): Promise<string> {
    return this.raw.render(player);
  }

  getImportedView(player: SampledPlayer): Promise<string> {
    return this.imported.render(player);
  }
}
