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

import { MatchCategoryLabelService } from '../shared/match-category-label.service';
import type { SampledMatch } from '../shared/review.types';
import type { MatchResultSummary } from './match-result-lookup.service';

/**
 * A sampled match plus its per-team scores and winner. `result` is absent
 * only when the match has no match_teams rows at all, which is itself worth
 * seeing in the report.
 */
export type ReviewedMatch = SampledMatch & { result?: MatchResultSummary };

export type ReviewReport = HarnessReviewReport<ReviewedMatch>;

/**
 * The match report's own half of the document: the per-match section. The
 * shell, stylesheet, gaps table and panel-pair layout come from
 * `ReportBuilderBase`.
 */
@Injectable()
export class ReportBuilderService extends ReportBuilderBase<ReviewedMatch> {
  constructor(
    html: HtmlService,
    private readonly categoryLabel: MatchCategoryLabelService,
  ) {
    super(html);
  }

  protected readonly title = 'Match import review';

  protected readonly entityNoun: ReportEntityNoun = {
    singular: 'match',
    plural: 'matches',
  };

  protected renderSection(match: ReviewedMatch, panels: ReviewPanel[]): string {
    const heading = this.html.escape(
      `${match.source.toUpperCase()} match ${match.externalId} — ` +
        `${match.competitionName}, ${match.matchName} ` +
        `[${this.categoryLabel.label(match.category)}] ` +
        `(${match.playedAt.toISOString().slice(0, 10)}, db id ${match.matchId})`,
    );
    const reasons = this.html.escape(
      `Selected for: ${match.selectedFor.join(', ')}`,
    );
    return `<section class="match">
<h2>${heading}</h2>
${this.resultBlock(match.result)}
<p class="reasons">${reasons}</p>
${panels.map((panel) => this.panelPair(panel, match.source)).join('\n')}
</section>`;
  }

  /**
   * The match's score line and outcome, as its own block rather than more
   * text in the heading: score and winner are the point of this data type's
   * review, and a heading that already carries five facts hides them.
   */
  private resultBlock(result: MatchResultSummary | undefined): string {
    if (result === undefined || result.teams.length === 0) {
      return this.html.note('No score or outcome recorded.');
    }
    const score = result.teams
      .map((team) => `${this.html.escape(team.teamName)} ${team.score}`)
      .join(' &#8211; ');
    const winner = result.teams.find(
      (team) => team.matchTeamId === result.winningMatchTeamId,
    );
    const outcome =
      result.winningMatchTeamId === null
        ? 'Draw'
        : `Winner: ${this.html.escape(winner?.teamName ?? `match team ${result.winningMatchTeamId}`)}`;
    return `<p class="result">${score} &#8212; ${outcome}</p>`;
  }
}
