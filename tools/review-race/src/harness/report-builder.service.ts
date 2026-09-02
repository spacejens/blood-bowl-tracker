import type {
  ReportEntityNoun,
  ReviewPanel,
  ReviewReport as HarnessReviewReport,
} from '@blood-bowl-tracker/review-harness';
import {
  HtmlService,
  ReportBuilderBase,
} from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import type { SampledRace } from '../shared/review.types';

export type ReviewReport = HarnessReviewReport<SampledRace>;

/**
 * The race report's own half of the document: the per-race section. The
 * shell, stylesheet, gaps table and panel-pair layout come from
 * `ReportBuilderBase`. No source is passed to `panelPair`: a race is not
 * sampled through one source, and all three reviewers name their own panels.
 */
@Injectable()
export class ReportBuilderService extends ReportBuilderBase<SampledRace> {
  protected readonly title = 'Race and position import review';

  protected readonly entityNoun: ReportEntityNoun = {
    singular: 'race',
    plural: 'races',
  };

  constructor(html: HtmlService) {
    super(html);
  }

  protected renderSection(race: SampledRace, panels: ReviewPanel[]): string {
    const heading = this.html.escape(`${race.raceName} (db id ${race.raceId})`);
    const reasons = this.html.escape(
      `Selected for: ${race.selectedFor.join(', ')}`,
    );
    return `<section class="race">
<h2>${heading}</h2>
<p class="reasons">${reasons}</p>
${panels.map((panel) => this.panelPair(panel)).join('\n')}
</section>`;
  }
}
