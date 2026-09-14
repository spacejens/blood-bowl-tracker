import type {
  ReportEntityNoun,
  ReviewPanel,
} from '@blood-bowl-tracker/review-harness';
import {
  HtmlService,
  ReportBuilderBase,
} from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import type { SampledStarPlayer } from '../shared/review.types';

/**
 * The star player report's own half of the document: the per-star section.
 * The shell, stylesheet, gaps table and panel-pair layout come from
 * `ReportBuilderBase`. No source is passed to `panelPair`: a star is not
 * sampled through one source, and all three reviewers name their own panels.
 */
@Injectable()
export class ReportBuilderService extends ReportBuilderBase<SampledStarPlayer> {
  protected readonly title = 'Star player import review';

  protected readonly entityNoun: ReportEntityNoun = {
    singular: 'star player',
    plural: 'star players',
  };

  constructor(html: HtmlService) {
    super(html);
  }

  protected renderSection(
    star: SampledStarPlayer,
    panels: ReviewPanel[],
  ): string {
    const heading = this.html.escape(
      `${star.positionName} (position id ${star.positionId})`,
    );
    const reasons = this.html.escape(
      `Selected for: ${star.selectedFor.join(', ')}`,
    );
    return `<section class="star-player">
<h2>${heading}</h2>
<p class="reasons">${reasons}</p>
${panels.map((panel) => this.panelPair(panel)).join('\n')}
</section>`;
  }
}
