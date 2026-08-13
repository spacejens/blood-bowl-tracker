import {
  HtmlService,
  ReportWriterService,
} from '@blood-bowl-tracker/review-harness';
import { Inject, Injectable } from '@nestjs/common';

import type { PlayerDataTypeReviewer } from '../shared/data-type-reviewer';
import { PLAYER_DATA_TYPE_REVIEWERS } from '../shared/data-type-reviewer';
import type { ReviewGap, SampledPlayer } from '../shared/review.types';
import { PlayerSamplerService } from './player-sampler.service';
import type { ReviewedPlayer, ReviewPanel } from './report-builder.service';
import { ReportBuilderService } from './report-builder.service';

export interface ReviewOutcome {
  /** Absolute path of the written report. */
  reportPath: string;
  playerCount: number;
  /** Strata/overrides that produced nothing — printed as warnings by main. */
  gaps: ReviewGap[];
}

/**
 * The whole run: sample players, ask every registered reviewer for its two
 * panels per player, assemble the document, write it.
 *
 * A reviewer that throws for one player yields an inline note in that panel
 * and the run continues — a single unreadable source file must not cost the
 * developer the rest of the report.
 */
@Injectable()
export class ReviewService {
  constructor(
    private readonly sampler: PlayerSamplerService,
    @Inject(PLAYER_DATA_TYPE_REVIEWERS)
    private readonly reviewers: PlayerDataTypeReviewer[],
    private readonly builder: ReportBuilderService,
    private readonly writer: ReportWriterService,
    private readonly html: HtmlService,
  ) {}

  async run(): Promise<ReviewOutcome> {
    const { players, gaps } = await this.sampler.sample();

    const reviewed: ReviewedPlayer[] = [];
    for (const player of players) {
      const panels: ReviewPanel[] = [];
      for (const reviewer of this.reviewers) {
        panels.push(await this.panel(reviewer, player));
      }
      reviewed.push({ player, panels });
    }

    const generatedAt = new Date();
    const html = this.builder.build({ players: reviewed, gaps, generatedAt });
    const reportPath = await this.writer.write(html, generatedAt);
    return { reportPath, playerCount: reviewed.length, gaps };
  }

  private async panel(
    reviewer: PlayerDataTypeReviewer,
    player: SampledPlayer,
  ): Promise<ReviewPanel> {
    return {
      dataTypeId: reviewer.id,
      rawHtml: await this.fragment(() => reviewer.getRawSource(player)),
      importedHtml: await this.fragment(() => reviewer.getImportedView(player)),
      rawLabel: reviewer.rawPanelLabel,
      importedLabel: reviewer.importedPanelLabel,
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
