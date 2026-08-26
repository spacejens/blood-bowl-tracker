import {
  HtmlService,
  ReportWriterService,
  ReviewServiceBase,
} from '@blood-bowl-tracker/review-harness';
import { Inject, Injectable } from '@nestjs/common';

import type { PlayerDataTypeReviewer } from '../shared/data-type-reviewer';
import { PLAYER_DATA_TYPE_REVIEWERS } from '../shared/data-type-reviewer';
import type { SampledPlayer } from '../shared/review.types';
import { PlayerSamplerService } from './player-sampler.service';
import { ReportBuilderService } from './report-builder.service';

export type { ReviewOutcome } from '@blood-bowl-tracker/review-harness';

/**
 * The player report needs nothing beyond the sampled player itself, so the
 * whole run is the shared one and `prepare()` hands each player straight
 * through.
 */
@Injectable()
export class ReviewService extends ReviewServiceBase<
  SampledPlayer,
  SampledPlayer
> {
  constructor(
    sampler: PlayerSamplerService,
    @Inject(PLAYER_DATA_TYPE_REVIEWERS) reviewers: PlayerDataTypeReviewer[],
    builder: ReportBuilderService,
    writer: ReportWriterService,
    html: HtmlService,
  ) {
    super(sampler, reviewers, builder, writer, html);
  }

  protected prepare(): Promise<(player: SampledPlayer) => SampledPlayer> {
    return Promise.resolve((player) => player);
  }
}
