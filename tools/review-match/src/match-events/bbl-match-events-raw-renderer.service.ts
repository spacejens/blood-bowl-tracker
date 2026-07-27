import { Injectable } from '@nestjs/common';
import type { CheerioAPI } from 'cheerio';
import { load } from 'cheerio';

import { HtmlService } from '../shared/html.service';
import { BblRawPageLoaderService } from '../source/bbl-raw-page-loader.service';

/** BBL's player-page links carry the player id as `pid`. */
const PID_LINK = /[?&]pid=([^&#"']+)/;

const HEADERS = ['Home', 'Label', 'Away'];

/**
 * Shows a BBL match page's event table as close to the raw scrape as is
 * readable: every three-cell `table.tblist` row, each cell split on `<br>`
 * exactly as BBL wrote it, with player ids and image alt texts spelled out.
 *
 * Deliberately does NOT match labels against any action/consequence
 * vocabulary and shares no code with `tools/import-bbl`'s page parser —
 * a mistake in that parser's vocabulary is one of the things this report
 * exists to expose.
 */
@Injectable()
export class BblMatchEventsRawRendererService {
  constructor(
    private readonly loader: BblRawPageLoaderService,
    private readonly html: HtmlService,
  ) {}

  async render(externalId: string): Promise<string> {
    const page = await this.loader.loadMatchPage(externalId);
    if (page === null) {
      return this.html.note(
        `Raw BBL page not found for match ${externalId} (expected a file ` +
          `named default.asp?p=m&m=${externalId} in the configured BBL data ` +
          'directory).',
      );
    }

    const $ = load(page);
    const rows: string[][] = [];
    $('table.tblist tr').each((_index, tr) => {
      const cells = $(tr).find('td');
      if (cells.length !== 3) {
        return;
      }
      rows.push(
        cells.map((_i, cell) => this.cellText($, $(cell).html() ?? '')).get(),
      );
    });

    if (rows.length === 0) {
      return this.html.note('No table.tblist rows found on the raw BBL page.');
    }
    return this.html.table(HEADERS, rows);
  }

  /** One cell, `<br>`-segmented; segments joined with a visible separator. */
  private cellText($: CheerioAPI, cellHtml: string): string {
    return cellHtml
      .split(/<br\s*\/?>/i)
      .map((fragment) => this.segmentText($, fragment))
      .filter((segment) => segment !== '')
      .join(' | ');
  }

  /** One `<br>` segment: its text, its player ids, and its image alt texts. */
  private segmentText($: CheerioAPI, fragmentHtml: string): string {
    const fragment = $(`<div>${fragmentHtml}</div>`);
    const pids = fragment
      .find('a')
      .map((_index, anchor) => PID_LINK.exec($(anchor).attr('href') ?? '')?.[1])
      .get()
      .filter((pid): pid is string => pid !== undefined);
    const alts = fragment
      .find('img')
      .map((_index, image) => $(image).attr('alt') ?? '')
      .get()
      .filter((alt) => alt !== '');
    const text = fragment.text().replace(/\s+/g, ' ').trim();

    const parts = [text];
    if (pids.length > 0) {
      parts.push(`pid=${pids.join(',')}`);
    }
    if (alts.length > 0) {
      parts.push(`img alt: ${alts.join(', ')}`);
    }
    return parts.filter((part) => part !== '').join(' — ');
  }
}
