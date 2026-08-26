import {
  HtmlService,
  ReportWriterService,
  ReviewServiceBase,
} from '@blood-bowl-tracker/review-harness';
import { Inject, Injectable } from '@nestjs/common';

import type { DataTypeReviewer } from '../shared/data-type-reviewer';
import { DATA_TYPE_REVIEWERS } from '../shared/data-type-reviewer';
import type { SampledMatch } from '../shared/review.types';
import { MatchResultLookupService } from './match-result-lookup.service';
import { MatchSamplerService } from './match-sampler.service';
import type { ReviewedMatch } from './report-builder.service';
import { ReportBuilderService } from './report-builder.service';

export type { ReviewOutcome } from '@blood-bowl-tracker/review-harness';

/**
 * The match tool's one addition to the shared review run: every sampled
 * match's score and winner, looked up for the whole sample at once.
 */
@Injectable()
export class ReviewService extends ReviewServiceBase<
  SampledMatch,
  ReviewedMatch
> {
  constructor(
    sampler: MatchSamplerService,
    @Inject(DATA_TYPE_REVIEWERS) reviewers: DataTypeReviewer[],
    builder: ReportBuilderService,
    writer: ReportWriterService,
    html: HtmlService,
    private readonly results: MatchResultLookupService,
  ) {
    super(sampler, reviewers, builder, writer, html);
  }

  protected async prepare(
    matches: SampledMatch[],
  ): Promise<(match: SampledMatch) => ReviewedMatch> {
    const resultsByMatchId = await this.results.findByMatchIds(
      matches.map((match) => match.matchId),
    );
    return (match) => ({
      ...match,
      result: resultsByMatchId.get(match.matchId),
    });
  }
}
