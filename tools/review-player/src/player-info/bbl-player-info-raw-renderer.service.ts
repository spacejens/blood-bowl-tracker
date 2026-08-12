import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';

import type { TableCell } from '../shared/html.service';
import { HtmlService } from '../shared/html.service';
import { BblRawPlayerPageLoaderService } from '../source/bbl-raw-player-page-loader.service';

const NONE = '—';

/** Achievement labels shown, in page order; anything else is ignored. */
const ACHIEVEMENTS = [
  'Interceptions',
  'Deflections',
  'Completions',
  'Touchdowns',
  'Casualties',
  'MVP awards',
  'Unspent SPP',
  'Fouls',
  'Compl. seasons',
] as const;

/**
 * Renders what BBL's own player page says about a player: identity, position,
 * team, and the career achievement counters the page publishes — including
 * BBL's career SPP figure, which sits in the "Unspent SPP" row's parenthetical
 * link.
 *
 * Parsed here with cheerio rather than through tools/import-bbl's parsers: the
 * importer's reading of this page is what the report exists to check, so
 * reusing it would let a misreading agree with itself. `HtmlService` is
 * injected as a real provider in this service's spec — it is a pure formatter
 * with its own tests, and mocking it would leave the markup unasserted.
 */
@Injectable()
export class BblPlayerInfoRawRendererService {
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
    const $ = cheerio.load(page);
    const achievements = this.achievements($);
    const rows: TableCell[][] = [
      ['Name', $('h1').first().text().trim() || NONE],
      ['Position', $('a.grey').first().text().trim() || NONE],
      ['Team', $('a[href*="p=tm"]').first().text().trim() || NONE],
      [
        'Career SPP (BBL)',
        $('a[href*="act=spp"]').first().text().trim() || NONE,
      ],
      ...ACHIEVEMENTS.map((label): TableCell[] => [
        label,
        achievements.get(label) ?? NONE,
      ]),
    ];
    return this.html.table(['Field', 'Value'], rows);
  }

  /**
   * Label -> value from the achievements table. Labels are read from the
   * `td.small` cells (some wrap their text in a link to the match list) and
   * the value is the next cell; a trailing colon is dropped.
   */
  private achievements($: cheerio.CheerioAPI): Map<string, string> {
    const values = new Map<string, string>();
    const table = $('table.tblist')
      .filter((_, element) => $(element).text().includes('Achievements:'))
      .first();
    table.find('td.small').each((_, element) => {
      const cell = $(element);
      const label = cell.text().trim().replace(/:$/, '');
      const value = cell.next().text().trim();
      if (label !== '' && value !== '') {
        values.set(label, value);
      }
    });
    return values;
  }
}
