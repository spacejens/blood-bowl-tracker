import { Injectable } from '@nestjs/common';

import type { DataTypeReviewer } from '../shared/data-type-reviewer';
import type { SampledMatch } from '../shared/review.types';
import { SppComputedRendererService } from './spp-computed-renderer.service';
import { SppImportedRendererService } from './spp-imported-renderer.service';
import { SppTotalsLookupService } from './spp-totals-lookup.service';

/**
 * The SPP-totals data type's entry point into the report harness.
 *
 * Unlike match-events, neither panel is a source file: both sides live in the
 * database, and the "raw" side is the one this tool derives itself from
 * `match_events` rather than the one an importer stored. Hence the explicit
 * panel labels.
 *
 * `load` runs once per panel rather than once per match: the harness contract
 * has no place to hand one reviewer's per-match state between its two calls,
 * and a second cheap read-only query is a better trade than a cache whose
 * invalidation nothing here would exercise.
 */
@Injectable()
export class SppTotalsReviewerService implements DataTypeReviewer {
  readonly id = 'spp-totals';
  readonly rawPanelLabel = 'Computed from match events (database)';
  readonly importedPanelLabel = 'Stored player totals (database)';

  constructor(
    private readonly lookup: SppTotalsLookupService,
    private readonly computed: SppComputedRendererService,
    private readonly imported: SppImportedRendererService,
  ) {}

  async getRawSource(match: SampledMatch): Promise<string> {
    return this.computed.render(await this.lookup.load(match));
  }

  async getImportedView(match: SampledMatch): Promise<string> {
    return this.imported.render(await this.lookup.load(match));
  }
}
