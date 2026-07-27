import { Injectable } from '@nestjs/common';

import type { DataTypeReviewer } from '../shared/data-type-reviewer';
import type { SampledMatch } from '../shared/review.types';
import { BblMatchEventsRawRendererService } from './bbl-match-events-raw-renderer.service';
import { MatchEventsDbRendererService } from './match-events-db-renderer.service';
import { TpMatchEventsRawRendererService } from './tp-match-events-raw-renderer.service';

/**
 * The match-events data type's entry point into the report harness: raw panel
 * from whichever source the match came from, imported panel from the database.
 */
@Injectable()
export class MatchEventsReviewerService implements DataTypeReviewer {
  readonly id = 'match-events';

  constructor(
    private readonly bblRaw: BblMatchEventsRawRendererService,
    private readonly tpRaw: TpMatchEventsRawRendererService,
    private readonly imported: MatchEventsDbRendererService,
  ) {}

  getRawSource(match: SampledMatch): Promise<string> {
    return match.source === 'bbl'
      ? this.bblRaw.render([match.externalId])
      : this.tpRaw.render(match.externalId);
  }

  getImportedView(match: SampledMatch): Promise<string> {
    return this.imported.render(match);
  }
}
