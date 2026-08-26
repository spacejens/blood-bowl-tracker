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

import type { SampledPlayer } from '../shared/review.types';

export type ReviewReport = HarnessReviewReport<SampledPlayer>;

/**
 * The player report's own half of the document: the per-player section. The
 * shell, stylesheet, gaps table and panel-pair layout come from
 * `ReportBuilderBase`.
 */
@Injectable()
export class ReportBuilderService extends ReportBuilderBase<SampledPlayer> {
  constructor(html: HtmlService) {
    super(html);
  }

  protected readonly title = 'Player import review';

  protected readonly entityNoun: ReportEntityNoun = {
    singular: 'player',
    plural: 'players',
  };

  protected renderSection(
    player: SampledPlayer,
    panels: ReviewPanel[],
  ): string {
    const heading = this.html.escape(
      `${player.source.toUpperCase()} player ${player.externalId} — ` +
        `${player.playerName} (${player.teamName}, ${player.positionName}, ` +
        `${player.eraName}, db id ${player.playerId})`,
    );
    const reasons = this.html.escape(
      `Selected for: ${player.selectedFor.join(', ')}`,
    );
    return `<section class="player">
<h2>${heading}</h2>
<p class="reasons">${reasons}</p>
${panels.map((panel) => this.panelPair(panel, player.source)).join('\n')}
</section>`;
  }
}
