import { Injectable } from '@nestjs/common';

/**
 * One header or cell's content:
 * - a plain string, rendered as a single escaped line;
 * - an array of strings, each escaped and joined with a line break — for a
 *   cell that packs several distinct pieces of information (e.g. several
 *   `<br>`-separated source segments, or two merged columns) into less
 *   horizontal space;
 * - a `{ pre }` block, escaped as a whole and rendered preformatted — for
 *   naturally multi-line content (e.g. pretty-printed JSON) where line
 *   breaks and indentation both matter;
 * - a `{ details }` block, rendered as a collapsed `<details>` disclosure
 *   wrapping any other cell — for bulky content (e.g. one event's whole raw
 *   JSON) that would otherwise make a long table unscannable. Build one with
 *   `details()` rather than by hand.
 */
export type TableCell =
  | string
  | readonly string[]
  | { readonly pre: string }
  | {
      readonly details: {
        readonly summary: string;
        readonly body: TableCell;
      };
    };

/**
 * One table row: either the cells themselves, or the cells wrapped with a
 * highlight marker for a row the reviewer must not miss (a value that
 * disagrees with its trusted counterpart). Highlighting is never the only
 * signal — a highlighted row also carries an explicit textual label in one of
 * its cells, so the report stays readable without colour.
 */
export type TableRow =
  | readonly TableCell[]
  | { readonly cells: readonly TableCell[]; readonly highlight: true };

/**
 * Builds the small HTML fragments every renderer needs. Escaping lives here
 * (rather than in each renderer) so raw source text — which routinely
 * contains markup, ampersands and quotes — can never break the report.
 */
@Injectable()
export class HtmlService {
  /** Escape text for safe interpolation into element content or attributes. */
  escape(text: string): string {
    return text
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  /** A table of cells; every header and cell is escaped here. */
  table(headers: readonly TableCell[], rows: readonly TableRow[]): string {
    if (rows.length === 0) {
      return this.note('No rows.');
    }
    const head = headers
      .map((header) => `<th>${this.cellHtml(header)}</th>`)
      .join('');
    const body = rows.map((row) => this.rowHtml(row)).join('');
    return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }

  /** Mark a row as disagreeing with its trusted counterpart. */
  highlight(cells: readonly TableCell[]): TableRow {
    return { cells, highlight: true };
  }

  /** An inline explanatory note (missing source file, gap, render error). */
  note(text: string): string {
    return `<p class="note">${this.escape(text)}</p>`;
  }

  /** A small label above one of several stacked fragments in a panel. */
  subheading(text: string): string {
    return `<h5>${this.escape(text)}</h5>`;
  }

  /**
   * A collapsed disclosure: the summary is always visible, the body only
   * once the reader expands it. Rendering (and escaping) happens in
   * `cellHtml` like every other cell kind.
   */
  details(summary: string, body: TableCell): TableCell {
    return { details: { summary, body } };
  }

  private rowHtml(row: TableRow): string {
    const highlighted = !Array.isArray(row);
    const cells = highlighted
      ? (row as { readonly cells: readonly TableCell[] }).cells
      : (row as readonly TableCell[]);
    const open = highlighted ? '<tr class="mismatch">' : '<tr>';
    return `${open}${cells
      .map((cell) => `<td>${this.cellHtml(cell)}</td>`)
      .join('')}</tr>`;
  }

  private cellHtml(cell: TableCell): string {
    if (typeof cell === 'string') {
      return this.escape(cell);
    }
    if ('pre' in cell) {
      return `<pre class="cell-pre">${this.escape(cell.pre)}</pre>`;
    }
    if ('details' in cell) {
      return (
        `<details><summary>${this.escape(cell.details.summary)}</summary>` +
        `${this.cellHtml(cell.details.body)}</details>`
      );
    }
    return cell.map((segment) => this.escape(segment)).join('<br>');
  }
}
