import { Injectable } from '@nestjs/common';
import type { CheerioAPI } from 'cheerio';
import { load } from 'cheerio';

import { HtmlService } from '../shared/html.service';
import { BblRawPageLoaderService } from '../source/bbl-raw-page-loader.service';

/** BBL's player-page links carry the player id as `pid`. */
const PID_LINK = /[?&]pid=([^&#"']+)/;

const FALLBACK_HEADERS = ['Home', 'Label', 'Away'];

/**
 * Shows a BBL match page's event table as close to the raw scrape as is
 * readable: every three-cell `table.tblist` row, each cell split on `<br>`
 * exactly as BBL wrote it, with player ids and image alt texts spelled out.
 * Any row with exactly three `<td>`s is shown — deliberately dumb structural
 * matching rather than an event-row allowlist, since the point is to expose
 * whatever is really in the table, not to pre-decide what counts as an
 * event. In every BBL match page examined, the only three-`<td>` rows under
 * `table.tblist` are the team-name header row (identified and pulled out
 * separately below) and the actual action/consequence rows.
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

  /**
   * One id renders exactly one table with no heading. Two ids — a BBL
   * four-team match the importer merged from two source rows — render both
   * pages' tables stacked, each labelled with the source match it came from,
   * so the union can be compared against the single imported panel.
   */
  async render(externalIds: string[]): Promise<string> {
    if (externalIds.length === 1) {
      return this.renderPage(externalIds[0]);
    }
    const parts: string[] = [];
    for (const externalId of externalIds) {
      parts.push(this.html.subheading(`Source match ${externalId}`));
      parts.push(await this.renderPage(externalId));
    }
    return parts.join('');
  }

  /** One source page's event table, or a note when it isn't in the mirror. */
  private async renderPage(externalId: string): Promise<string> {
    const page = await this.loader.loadMatchPage(externalId);
    if (page === null) {
      return this.html.note(
        `Raw BBL page not found for match ${externalId} (expected a file ` +
          `named default.asp?p=m&m=${externalId} in the configured BBL data ` +
          'directory).',
      );
    }

    const $ = load(page);
    const rows: (readonly string[])[][] = [];
    $('table.tblist tr').each((_index, tr) => {
      const cells = $(tr).find('td');
      if (cells.length !== 3) {
        return;
      }
      rows.push(
        cells.toArray().map((cell) => this.cellText($, $(cell).html() ?? '')),
      );
    });

    if (rows.length === 0) {
      return this.html.note('No table.tblist rows found on the raw BBL page.');
    }
    return this.html.table(this.headers($), rows);
  }

  /**
   * "Home"/"Away" replaced with the two teams' names, read from the page's
   * team-header row (the row whose middle cell holds the nested TD/cas-score
   * table) — falls back to the generic labels when that row, or a team name
   * inside it, isn't found.
   */
  private headers($: CheerioAPI): string[] {
    const headerRow = $('table.tblist').first().find('tr').first();
    const cells = headerRow.children('td');
    if (cells.length !== 3) {
      return FALLBACK_HEADERS;
    }
    const home = cells.eq(0).find('b').first().text().trim();
    const away = cells.eq(2).find('b').first().text().trim();
    return home !== '' && away !== ''
      ? [home, 'Label', away]
      : FALLBACK_HEADERS;
  }

  /** One cell's `<br>`-separated segments, rendered as one line each. */
  private cellText($: CheerioAPI, cellHtml: string): string[] {
    return cellHtml
      .split(/<br\s*\/?>/i)
      .map((fragment) => this.segmentText($, fragment))
      .filter((segment) => segment !== '');
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
