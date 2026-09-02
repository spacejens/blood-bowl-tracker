import {
  HtmlService,
  ReportWriterService,
  ReviewServiceBase,
} from '@blood-bowl-tracker/review-harness';
import { Inject, Injectable } from '@nestjs/common';

import type { RaceDataTypeReviewer } from '../shared/data-type-reviewer';
import { RACE_DATA_TYPE_REVIEWERS } from '../shared/data-type-reviewer';
import type { SampledRace } from '../shared/review.types';
import { RaceSamplerService } from './race-sampler.service';
import { ReportBuilderService } from './report-builder.service';

export type { ReviewOutcome } from '@blood-bowl-tracker/review-harness';

/**
 * The race report needs nothing beyond the sampled race itself — every panel
 * looks up what it needs per race — so the whole run is the shared one and
 * `prepare()` hands each race straight through.
 */
@Injectable()
export class ReviewService extends ReviewServiceBase<SampledRace, SampledRace> {
  constructor(
    sampler: RaceSamplerService,
    @Inject(RACE_DATA_TYPE_REVIEWERS) reviewers: RaceDataTypeReviewer[],
    builder: ReportBuilderService,
    writer: ReportWriterService,
    html: HtmlService,
  ) {
    super(sampler, reviewers, builder, writer, html);
  }

  protected prepare(): Promise<(race: SampledRace) => SampledRace> {
    return Promise.resolve((race) => race);
  }
}
