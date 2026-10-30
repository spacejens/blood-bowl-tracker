import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';

import { BblRawPlayerPageLoaderService } from './bbl-raw-player-page-loader.service';

/** The row label, without its trailing colon. */
const UNSPENT_LABEL = 'Unspent SPP';

/** BBL prints the figure as a bare integer, negative when overspent. */
const WHOLE_NUMBER = /^-?\d+$/;

/** The career total sits in brackets in the next cell, linked or not. */
const BRACKETED_NUMBER = /\((-?\d+)\)/;

/** What one BBL player page's "Unspent SPP" row says. */
export interface BblUnspentSppFigures {
  /** The row's own figure, as printed; can be negative. Null when absent. */
  unspent: number | null;
  /** The career total printed in brackets beside it. Null when absent. */
  careerTotal: number | null;
}

/**
 * Reads the "Unspent SPP" row of a BBL player page: BBL's own unspent figure
 * and, in brackets, the career total it is taken from. Parsed here with
 * cheerio rather than through `tools/import-bbl`, whose reading of the page
 * is code under review.
 *
 * Results are cached per pid for the lifetime of the process. The
 * unspent-SPP stratum reads every BBL player's page once, and the panels for
 * a sampled player then read the same figures again; the cache makes that
 * one mirror read per page per run.
 */
@Injectable()
export class BblUnspentSppReaderService {
  private readonly cache = new Map<
    string,
    Promise<BblUnspentSppFigures | null>
  >();

  constructor(private readonly loader: BblRawPlayerPageLoaderService) {}

  read(externalId: string): Promise<BblUnspentSppFigures | null> {
    let cached = this.cache.get(externalId);
    if (cached === undefined) {
      cached = this.load(externalId);
      this.cache.set(externalId, cached);
    }
    return cached;
  }

  private async load(externalId: string): Promise<BblUnspentSppFigures | null> {
    const page = await this.loader.loadPlayerPage(externalId);
    return page === null ? null : this.parse(page);
  }

  private parse(page: string): BblUnspentSppFigures {
    const $ = cheerio.load(page);
    const label = $('td.small')
      .filter(
        (_, element) =>
          this.normalize($(element).text()).replace(/:$/, '') === UNSPENT_LABEL,
      )
      .first();
    if (label.length === 0) {
      return { unspent: null, careerTotal: null };
    }
    const valueCell = label.next('td');
    const value = this.normalize(valueCell.text());
    const total = BRACKETED_NUMBER.exec(
      this.normalize(valueCell.next('td').text()),
    );
    return {
      unspent: WHOLE_NUMBER.test(value) ? Number(value) : null,
      careerTotal: total === null ? null : Number(total[1]),
    };
  }

  private normalize(raw: string): string {
    return raw.replace(/\xA0/g, ' ').trim().replace(/\s+/g, ' ');
  }
}
