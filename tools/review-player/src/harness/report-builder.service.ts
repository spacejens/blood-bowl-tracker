import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import type { ReviewGap, SampledPlayer } from '../shared/review.types';

/** One data type's two panels for one player. */
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

export interface ReviewedPlayer {
  player: SampledPlayer;
  panels: ReviewPanel[];
}

export interface ReviewReport {
  players: ReviewedPlayer[];
  gaps: ReviewGap[];
  generatedAt: Date;
}

const STYLES = `
  body { font-family: system-ui, sans-serif; margin: 2rem; color: #222; }
  h1 { font-size: 1.5rem; }
  h2 { font-size: 1.1rem; margin-bottom: 0.25rem; }
  section.player { border-top: 2px solid #ccc; padding-top: 1rem; margin-top: 2rem; }
  .reasons { color: #555; font-size: 0.9rem; margin: 0 0 0.75rem; }
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
  constructor(private readonly html: HtmlService) {}

  build(report: ReviewReport): string {
    const body =
      report.players.length === 0
        ? this.html.note('No players were sampled.')
        : report.players.map((entry) => this.playerSection(entry)).join('\n');

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Player import review</title>
<style>${STYLES}</style>
</head>
<body>
<h1>Player import review</h1>
<p>Generated ${this.html.escape(report.generatedAt.toISOString())} — ${report.players.length} player(s).</p>
${this.gapsSection(report.gaps)}
${body}
</body>
</html>
`;
  }

  private gapsSection(gaps: ReviewGap[]): string {
    if (gaps.length === 0) {
      return '<p>No gaps: every stratum and override produced at least one player.</p>';
    }
    return `<h2>Gaps</h2>${this.html.table(
      ['Source', 'Gap'],
      gaps.map((gap) => [gap.source.toUpperCase(), gap.reason]),
    )}`;
  }

  private playerSection({ player, panels }: ReviewedPlayer): string {
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
${panels.map((panel) => this.panelPair(panel, player)).join('\n')}
</section>`;
  }

  private panelPair(panel: ReviewPanel, player: SampledPlayer): string {
    const rawLabel =
      panel.rawLabel ?? `Raw source (${player.source.toUpperCase()})`;
    const importedLabel = panel.importedLabel ?? 'Imported (database)';
    return `<h3>${this.html.escape(panel.dataTypeId)}</h3>
<div class="panels">
<div class="panel"><h4>${this.html.escape(rawLabel)}</h4>${panel.rawHtml}</div>
<div class="panel"><h4>${this.html.escape(importedLabel)}</h4>${panel.importedHtml}</div>
</div>`;
  }
}
