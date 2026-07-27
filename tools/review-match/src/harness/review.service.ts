import { Inject, Injectable } from '@nestjs/common';

import type { DataTypeReviewer } from '../shared/data-type-reviewer';
import { DATA_TYPE_REVIEWERS } from '../shared/data-type-reviewer';
import { HtmlService } from '../shared/html.service';
import type { ReviewGap, SampledMatch } from '../shared/review.types';
import { MatchSamplerService } from './match-sampler.service';
import type { ReviewedMatch, ReviewPanel } from './report-builder.service';
import { ReportBuilderService } from './report-builder.service';
import { ReportWriterService } from './report-writer.service';

export interface ReviewOutcome {
  /** Absolute path of the written report. */
  reportPath: string;
  matchCount: number;
  /** Strata/overrides that produced nothing — printed as warnings by main. */
  gaps: ReviewGap[];
}

/**
 * The whole run: sample matches, ask every registered reviewer for its two
 * panels per match, assemble the document, write it.
 *
 * A reviewer that throws for one match yields an inline note in that panel and
 * the run continues — a single unreadable source file must not cost the
 * developer the rest of the report.
 */
@Injectable()
export class ReviewService {
  constructor(
    private readonly sampler: MatchSamplerService,
    @Inject(DATA_TYPE_REVIEWERS)
    private readonly reviewers: DataTypeReviewer[],
    private readonly builder: ReportBuilderService,
    private readonly writer: ReportWriterService,
    private readonly html: HtmlService,
  ) {}

  async run(): Promise<ReviewOutcome> {
    const { matches, gaps } = await this.sampler.sample();

    const reviewed: ReviewedMatch[] = [];
    for (const match of matches) {
      const panels: ReviewPanel[] = [];
      for (const reviewer of this.reviewers) {
        panels.push(await this.panel(reviewer, match));
      }
      reviewed.push({ match, panels });
    }

    const html = this.builder.build({
      matches: reviewed,
      gaps,
      generatedAt: new Date(),
    });
    const reportPath = await this.writer.write(html);
    return { reportPath, matchCount: reviewed.length, gaps };
  }

  private async panel(
    reviewer: DataTypeReviewer,
    match: SampledMatch,
  ): Promise<ReviewPanel> {
    return {
      dataTypeId: reviewer.id,
      rawHtml: await this.fragment(() => reviewer.getRawSource(match)),
      importedHtml: await this.fragment(() => reviewer.getImportedView(match)),
    };
  }

  private async fragment(render: () => Promise<string>): Promise<string> {
    try {
      return await render();
    } catch (error) {
      return this.html.note(
        `Rendering failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
