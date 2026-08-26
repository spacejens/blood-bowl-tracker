import type { HtmlService } from './html.service';
import type { ReviewGap, ReviewSource } from './review.types';

/** One data type's two panels for one reviewed entity. */
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

/** One reviewed entity together with every reviewer's panels for it. */
export interface ReviewedItem<TReviewed> {
  item: TReviewed;
  panels: ReviewPanel[];
}

/** Everything one report document is assembled from. */
export interface ReviewReport<TReviewed> {
  items: ReviewedItem<TReviewed>[];
  gaps: ReviewGap[];
  generatedAt: Date;
}

/**
 * What a tool's report calls the thing it reviews, in prose — e.g.
 * `{ singular: 'match', plural: 'matches' }`.
 */
export interface ReportEntityNoun {
  singular: string;
  plural: string;
}

const STYLES = `
  body { font-family: system-ui, sans-serif; margin: 2rem; color: #222; }
  h1 { font-size: 1.5rem; }
  h2 { font-size: 1.1rem; margin-bottom: 0.25rem; }
  section { border-top: 2px solid #ccc; padding-top: 1rem; margin-top: 2rem; }
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
 * The report document every review tool produces: the HTML shell, the shared
 * stylesheet, the gaps section and the panel-pair layout. Deliberately knows
 * nothing about any data type — panels arrive as opaque HTML fragments from
 * the reviewers and are inserted verbatim (reviewers escape their own content
 * through `HtmlService`); everything assembled here is escaped here.
 *
 * A tool subclasses this and supplies only what differs between reports: the
 * title, the noun for the reviewed entity, and how one entity's section looks.
 *
 * Deliberately not `@Injectable()`: it is never a provider itself — each
 * tool's concrete subclass carries the decorator.
 */
export abstract class ReportBuilderBase<TReviewed> {
  constructor(protected readonly html: HtmlService) {}

  /** Document `<title>` and `<h1>`, e.g. `'Match import review'`. */
  protected abstract readonly title: string;

  /** The reviewed entity's noun, for the report's own prose. */
  protected abstract readonly entityNoun: ReportEntityNoun;

  /** One reviewed entity's whole section, panels included. */
  protected abstract renderSection(
    item: TReviewed,
    panels: ReviewPanel[],
  ): string;

  build(report: ReviewReport<TReviewed>): string {
    const count = report.items.length;
    const noun =
      count === 1 ? this.entityNoun.singular : this.entityNoun.plural;
    const body =
      count === 0
        ? this.html.note(`No ${this.entityNoun.plural} were sampled.`)
        : report.items
            .map((entry) => this.renderSection(entry.item, entry.panels))
            .join('\n');

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${this.html.escape(this.title)}</title>
<style>${STYLES}</style>
</head>
<body>
<h1>${this.html.escape(this.title)}</h1>
<p>Generated ${this.html.escape(report.generatedAt.toISOString())} — ${count} ${noun}.</p>
${this.gapsSection(report.gaps)}
${body}
</body>
</html>
`;
  }

  /**
   * One data type's two panels, side by side. A reviewer that named its
   * panels gets its own headings; anything else gets the generic pair.
   */
  protected panelPair(panel: ReviewPanel, source: ReviewSource): string {
    const rawLabel = panel.rawLabel ?? `Raw source (${source.toUpperCase()})`;
    const importedLabel = panel.importedLabel ?? 'Imported (database)';
    return `<h3>${this.html.escape(panel.dataTypeId)}</h3>
<div class="panels">
<div class="panel"><h4>${this.html.escape(rawLabel)}</h4>${panel.rawHtml}</div>
<div class="panel"><h4>${this.html.escape(importedLabel)}</h4>${panel.importedHtml}</div>
</div>`;
  }

  private gapsSection(gaps: ReviewGap[]): string {
    if (gaps.length === 0) {
      return `<p>No gaps: every stratum and override produced at least one ${this.entityNoun.singular}.</p>`;
    }
    return `<h2>Gaps</h2>${this.html.table(
      ['Source', 'Gap'],
      gaps.map((gap) => [gap.source.toUpperCase(), gap.reason]),
    )}`;
  }
}
