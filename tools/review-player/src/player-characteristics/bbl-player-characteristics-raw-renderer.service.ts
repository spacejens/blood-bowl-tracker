import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';

import { BblRawPlayerPageLoaderService } from '../source/bbl-raw-player-page-loader.service';
import { NO_CHARACTERISTIC } from './characteristic-format.service';

/** The characteristics table's header cells, in column order. */
const HEADERS = ['MA', 'ST', 'AG', 'PA', 'AV'] as const;

/** BBL's own "this characteristic does not exist" cell. */
const BBL_ABSENT = '-';

/** A cell whose numeric value is zero, in either of BBL's two spellings. */
const ZERO = /^0\+?$/;

/**
 * What BBL's own player page says a player's MA/ST/AG/PA/AV are, shown as the
 * page shows them — a bare number or a `+`-suffixed roll target, exactly as
 * scraped, with only two substitutions: BBL's literal `-` (a characteristic
 * the player's rules set does not have) and a zero both render as the report's
 * none marker, since zero is never a real characteristic value.
 *
 * Parsed here with cheerio rather than through tools/import-bbl's parser: the
 * importer's reading of this page is exactly what the report exists to check,
 * so reusing it would let a misreading agree with itself. `HtmlService` is
 * injected real in this service's spec — it is a pure formatter with its own
 * tests, and mocking it would leave the markup unasserted.
 */
@Injectable()
export class BblPlayerCharacteristicsRawRendererService {
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
    const cells = this.characteristicCells(cheerio.load(page));
    if (cells === null) {
      return this.html.note(
        `No characteristics line on the BBL player page for pid ${externalId}.`,
      );
    }
    return this.html.table(
      [...HEADERS],
      [cells.map((cell) => this.display(cell))],
    );
  }

  /**
   * A `-` and a zero both become the none marker; every other cell is shown
   * verbatim, unparsed. A cell this tool cannot read is itself the finding,
   * so it is never swallowed or normalised away.
   */
  private display(text: string): string {
    return text === BBL_ABSENT || ZERO.test(text) ? NO_CHARACTERISTIC : text;
  }

  /**
   * The five value cells: the row whose first five header cells are exactly
   * MA/ST/AG/PA/AV, then the first five `td`s of the row after it. A player
   * page carries several header rows, so the table is found by header text
   * rather than by class. Null when no such row exists, or when the row after
   * it has fewer than five cells.
   */
  private characteristicCells(page: cheerio.CheerioAPI): string[] | null {
    for (const row of page('tr').toArray()) {
      const headers = page(row)
        .children('th, td')
        .toArray()
        .map((cell) => page(cell).text().trim());
      if (HEADERS.some((header, index) => headers[index] !== header)) {
        continue;
      }
      const cells = page(row)
        .next('tr')
        .children('td')
        .toArray()
        .map((cell) => page(cell).text().trim());
      return cells.length < HEADERS.length
        ? null
        : cells.slice(0, HEADERS.length);
    }
    return null;
  }
}
