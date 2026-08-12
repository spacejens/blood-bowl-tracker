import { Injectable } from '@nestjs/common';

import { HtmlService } from '../shared/html.service';
import { MatchCategoryLabelService } from '../shared/match-category-label.service';
import type { ReviewGap, SampledMatch } from '../shared/review.types';
import type { MatchResultSummary } from './match-result-lookup.service';

/** One data type's two panels for one match. */
export interface ReviewPanel {
  dataTypeId: string;
  /** Opaque HTML fragment from the reviewer — inserted verbatim. */
  rawHtml: string;
  /** Opaque HTML fragment from the reviewer — inserted verbatim. */
  importedHtml: string;
  /** Reviewer-supplied heading for the left panel, when it has one. */
  rawLabel?: string;
  /** Reviewer-supplied heading for the right panel, when it has one. */
  importedLabel?: string;
}

export interface ReviewedMatch {
  match: SampledMatch;
  panels: ReviewPanel[];
  /**
   * The match's per-team scores and winner. Absent only when the match has
   * no match_teams rows at all, which is itself worth seeing in the report.
   */
  result?: MatchResultSummary;
}

export interface ReviewReport {
  matches: ReviewedMatch[];
  gaps: ReviewGap[];
  generatedAt: Date;
}

const STYLES = `
  body { font-family: system-ui, sans-serif; margin: 2rem; color: #222; }
  h1 { font-size: 1.5rem; }
  h2 { font-size: 1.1rem; margin-bottom: 0.25rem; }
  section.match { border-top: 2px solid #ccc; padding-top: 1rem; margin-top: 2rem; }
  .reasons { color: #555; font-size: 0.9rem; margin: 0 0 0.75rem; }
  .result { font-size: 0.95rem; margin: 0 0 0.25rem; font-weight: 600; }
  .panels { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; align-items: start; }
  .panel { border: 1px solid #ddd; padding: 0.5rem; overflow-x: auto; }
  .panel h4 { margin: 0 0 0.5rem; font-size: 0.95rem; }
  table { border-collapse: collapse; font-size: 0.8rem; width: 100%; }
  th, td { border: 1px solid #ddd; padding: 2px 4px; text-align: left; vertical-align: top; }
  th { background: #f4f4f4; }
  tr.mismatch td { background: #ffe8e8; }
  tr.mismatch td:last-child { font-weight: 600; color: #a00; }
  .note { color: #a00; font-style: italic; }
  .cell-pre { margin: 0; white-space: pre-wrap; word-break: break-word; font-family: monospace; }
  details summary { cursor: pointer; color: #06c; }
`;

/**
 * Assembles the whole report document. Deliberately knows nothing about any
 * data type: panels arrive as opaque HTML fragments from the reviewers and are
 * inserted verbatim (the reviewers escape their own content through
 * `HtmlService`); everything this service formats itself is escaped here.
 */
@Injectable()
export class ReportBuilderService {
  constructor(
    private readonly html: HtmlService,
    private readonly categoryLabel: MatchCategoryLabelService,
  ) {}

  build(report: ReviewReport): string {
    const body =
      report.matches.length === 0
        ? this.html.note('No matches were sampled.')
        : report.matches.map((entry) => this.matchSection(entry)).join('\n');

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Match import review</title>
<style>${STYLES}</style>
</head>
<body>
<h1>Match import review</h1>
<p>Generated ${this.html.escape(report.generatedAt.toISOString())} — ${report.matches.length} match(es).</p>
${this.gapsSection(report.gaps)}
${body}
</body>
</html>
`;
  }

  private gapsSection(gaps: ReviewGap[]): string {
    if (gaps.length === 0) {
      return '<p>No gaps: every stratum and override produced at least one match.</p>';
    }
    return `<h2>Gaps</h2>${this.html.table(
      ['Source', 'Gap'],
      gaps.map((gap) => [gap.source.toUpperCase(), gap.reason]),
    )}`;
  }

  private matchSection({ match, panels, result }: ReviewedMatch): string {
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
${this.resultBlock(result)}
<p class="reasons">${reasons}</p>
${panels.map((panel) => this.panelPair(panel, match)).join('\n')}
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

  private panelPair(panel: ReviewPanel, match: SampledMatch): string {
    const rawLabel =
      panel.rawLabel ?? `Raw source (${match.source.toUpperCase()})`;
    const importedLabel = panel.importedLabel ?? 'Imported (database)';
    return `<h3>${this.html.escape(panel.dataTypeId)}</h3>
<div class="panels">
<div class="panel"><h4>${this.html.escape(rawLabel)}</h4>${panel.rawHtml}</div>
<div class="panel"><h4>${this.html.escape(importedLabel)}</h4>${panel.importedHtml}</div>
</div>`;
  }
}
