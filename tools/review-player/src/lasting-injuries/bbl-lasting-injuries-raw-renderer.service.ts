import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';

import { BblRawPlayerPageLoaderService } from '../source/bbl-raw-player-page-loader.service';

/** The label cell that identifies the sustained-injuries row. */
const LABEL = 'Sustained Injuries:';

/**
 * What BBL's own player page says about a player's outstanding injuries,
 * shown exactly as the page words it.
 *
 * Deliberately uninterpreted: this panel renders the free text, it does not
 * parse it into counts. The importer's reading of this very text is what the
 * report exists to check, so re-deriving the same conclusion here would let a
 * misreading agree with itself — the same reason this tool parses BBL pages
 * with its own cheerio rather than reusing tools/import-bbl's parser.
 *
 * Whitespace is collapsed and `<br>` becomes a space, so the cell reads as one
 * sentence instead of running words together the way a bare `.text()` would.
 *
 * `HtmlService` is injected real in this service's spec — it is a pure
 * formatter with its own tests, and mocking it would leave the markup
 * unasserted.
 */
@Injectable()
export class BblLastingInjuriesRawRendererService {
  constructor(
    private readonly loader: BblRawPlayerPageLoaderService,
    private readonly html: HtmlService,
  ) {}

  async render(externalId: string): Promise<string> {
    const page = await this.loader.loadPlayerPage(externalId);
    if (page === null) {
      return this.html.note(
        `No BBL player page for pid ${externalId} in the downloaded mirror.`,
      );
    }
    const text = this.sustainedInjuriesText(cheerio.load(page));
    if (text === null) {
      return this.html.note(
        `No sustained-injuries row on the BBL player page for pid ${externalId}.`,
      );
    }
    return this.html.table(['Sustained Injuries'], [[text]]);
  }

  /**
   * The value cell next to the label cell whose text is exactly the label.
   * Null when the page has no such row — which is not an error: most players
   * have never been hurt, and BBL simply omits the row for some pages.
   */
  private sustainedInjuriesText(page: cheerio.CheerioAPI): string | null {
    for (const element of page('td').toArray()) {
      if (page(element).text().replace(/\s+/g, ' ').trim() !== LABEL) {
        continue;
      }
      const valueCell = page(element).next('td');
      if (valueCell.length === 0) {
        return null;
      }
      const html = (valueCell.html() ?? '').replace(/<br\s*\/?>/gi, ' ');
      return cheerio.load(html).root().text().replace(/\s+/g, ' ').trim();
    }
    return null;
  }
}
