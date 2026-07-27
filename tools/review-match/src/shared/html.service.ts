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
 *   breaks and indentation both matter.
 */
export type TableCell = string | readonly string[] | { readonly pre: string };

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
  table(
    headers: readonly TableCell[],
    rows: readonly (readonly TableCell[])[],
  ): string {
    if (rows.length === 0) {
      return this.note('No rows.');
    }
    const head = headers
      .map((header) => `<th>${this.cellHtml(header)}</th>`)
      .join('');
    const body = rows
      .map(
        (row) =>
          `<tr>${row.map((cell) => `<td>${this.cellHtml(cell)}</td>`).join('')}</tr>`,
      )
      .join('');
    return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }

  /** An inline explanatory note (missing source file, gap, render error). */
  note(text: string): string {
    return `<p class="note">${this.escape(text)}</p>`;
  }

  /** A small label above one of several stacked fragments in a panel. */
  subheading(text: string): string {
    return `<h5>${this.escape(text)}</h5>`;
  }

  private cellHtml(cell: TableCell): string {
    if (typeof cell === 'string') {
      return this.escape(cell);
    }
    if ('pre' in cell) {
      return `<pre class="cell-pre">${this.escape(cell.pre)}</pre>`;
    }
    return cell.map((segment) => this.escape(segment)).join('<br>');
  }
}
