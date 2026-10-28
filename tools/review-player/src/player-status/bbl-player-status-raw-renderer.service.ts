import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';

import { BblRawPlayerPageLoaderService } from '../source/bbl-raw-player-page-loader.service';

/**
 * The player's own header block: the name under the portrait, whose `<b>`
 * carries the player's status icons. The selector is deliberately identical
 * to the one the BBL importer uses, since it matches the documented page
 * shape; the review therefore verifies the icons read from that block, not
 * the choice of block.
 */
const PLAYER_HEADER = 'div[style*="padding-bottom:1px"] > b';

/** The bounty icon shares the header block but says nothing about status. */
const BOUNTY_FILE = 'bounty.gif';

/**
 * What BBL's own player page says about a player's status: every icon in the
 * player-header block, as its `alt` text and image file name.
 *
 * Deliberately uninterpreted: every icon is listed, in page order, with no
 * precedence between them, and no icon at all is reported as exactly that —
 * never as "active". Reading an icon as a status, and choosing between
 * several, is the importer's judgement under review; this tool parses the
 * page with its own cheerio rather than reusing tools/import-bbl's parser so
 * a misreading cannot agree with itself.
 *
 * Only the header block counts: the same icons appear on links to other
 * players elsewhere on the page.
 *
 * `HtmlService` is injected real in this service's spec — it is a pure
 * formatter with its own tests, and mocking it would leave the markup
 * unasserted.
 */
@Injectable()
export class BblPlayerStatusRawRendererService {
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
    const header = $(PLAYER_HEADER).first();
    if (header.length === 0) {
      return this.html.note(
        `No player header block on the BBL player page for pid ${externalId}.`,
      );
    }
    const icons = header
      .find('img')
      .toArray()
      .map((element) => [
        $(element).attr('alt') ?? '',
        this.fileName($(element).attr('src') ?? ''),
      ])
      .filter(([, file]) => file !== BOUNTY_FILE);
    if (icons.length === 0) {
      return this.html.note('No status icon in the player header.');
    }
    return this.html.table(['Icon alt text', 'Image file'], icons);
  }

  /** The last path segment of an image `src`, relative or absolute. */
  private fileName(src: string): string {
    return src.slice(src.lastIndexOf('/') + 1);
  }
}
