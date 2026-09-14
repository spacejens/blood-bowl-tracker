import {
  HtmlService,
  ReportWriterService,
  ReviewServiceBase,
} from '@blood-bowl-tracker/review-harness';
import { Inject, Injectable } from '@nestjs/common';

import type { StarPlayerDataTypeReviewer } from '../shared/data-type-reviewer';
import { STAR_PLAYER_DATA_TYPE_REVIEWERS } from '../shared/data-type-reviewer';
import type { SampledStarPlayer } from '../shared/review.types';
import { ReportBuilderService } from './report-builder.service';
import { StarPlayerSamplerService } from './star-player-sampler.service';

export type { ReviewOutcome } from '@blood-bowl-tracker/review-harness';

/**
 * The star player report needs nothing beyond the sampled star itself — every
 * panel looks up what it needs per star — so the whole run is the shared one
 * and `prepare()` hands each star straight through.
 */
@Injectable()
export class ReviewService extends ReviewServiceBase<
  SampledStarPlayer,
  SampledStarPlayer
> {
  constructor(
    sampler: StarPlayerSamplerService,
    @Inject(STAR_PLAYER_DATA_TYPE_REVIEWERS)
    reviewers: StarPlayerDataTypeReviewer[],
    builder: ReportBuilderService,
    writer: ReportWriterService,
    html: HtmlService,
  ) {
    super(sampler, reviewers, builder, writer, html);
  }

  protected prepare(): Promise<(star: SampledStarPlayer) => SampledStarPlayer> {
    return Promise.resolve((star) => star);
  }
}
