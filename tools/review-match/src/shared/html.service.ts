import { Injectable } from '@nestjs/common';

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

  /** A table of plain-text cells; every header and cell is escaped here. */
  table(
    headers: readonly string[],
    rows: readonly (readonly string[])[],
  ): string {
    if (rows.length === 0) {
      return this.note('No rows.');
    }
    const head = headers
      .map((header) => `<th>${this.escape(header)}</th>`)
      .join('');
    const body = rows
      .map(
        (row) =>
          `<tr>${row.map((cell) => `<td>${this.escape(cell)}</td>`).join('')}</tr>`,
      )
      .join('');
    return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }

  /** An inline explanatory note (missing source file, gap, render error). */
  note(text: string): string {
    return `<p class="note">${this.escape(text)}</p>`;
  }
}
