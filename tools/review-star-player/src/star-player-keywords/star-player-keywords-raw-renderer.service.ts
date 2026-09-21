import type { TableRow } from '@blood-bowl-tracker/review-harness';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import type { SampledStarPlayer } from '../shared/review.types';
import { StarSourceLookupService } from '../shared/star-source-lookup.service';
import { ManualRawDataService } from '../source/manual-raw-data.service';
import type { TpRawStarPlayerEntry } from '../source/tp-raw-star-player-index.service';

/** What a cell shows for a star TP gives no keyword codes. */
const NO_KEYWORDS = 'none';

/** What a cell shows for an entry TP carries no numeric positionTypes on. */
const NO_POSITION_TYPES = 'none';

/** The column headers of this panel's one table. */
const HEADERS = ['Rules set', 'TP keyword codes', 'positionTypes', 'isBigGuy'];

/**
 * The star-keywords raw panel: TP's own numeric keyword codes for this star,
 * next to the curated catalogue that names them.
 *
 * Only TP publishes keywords -- BBL has no such concept, so unlike the other
 * raw panels there is no BBL sub-section here. Each row already names the
 * curated keyword alongside its numeric TP code, so the curated catalogue
 * itself is not rendered separately here.
 *
 * Written independently of `tools/review-race`'s equivalent panel, per this
 * tool's independence rule: the TP reader and the curated catalogue reader
 * are both this tool's own, not shared.
 */
@Injectable()
export class StarPlayerKeywordsRawRendererService {
  constructor(
    private readonly lookup: StarSourceLookupService,
    private readonly manual: ManualRawDataService,
    private readonly html: HtmlService,
  ) {}

  async render(star: SampledStarPlayer): Promise<string> {
    const catalogue = await this.catalogueByCode();
    return this.tpSection(star, catalogue);
  }

  private async tpSection(
    star: SampledStarPlayer,
    catalogue: Map<string, string>,
  ): Promise<string> {
    const lookup = await this.lookup.tpStarsFor(star);
    if (lookup.stars.length === 0) {
      return (
        this.html.subheading('TP') +
        this.html.table(HEADERS, [
          this.html.highlight([
            lookup.notFoundNote,
            NO_KEYWORDS,
            NO_POSITION_TYPES,
            'no',
          ]),
        ])
      );
    }
    const rows: TableRow[] = [];
    for (const tpStar of lookup.stars) {
      for (const entry of tpStar.entries) {
        rows.push(this.tpRow(entry, catalogue));
      }
    }
    return this.html.subheading('TP') + this.html.table(HEADERS, rows);
  }

  /**
   * One rules set's row. The last two cells are TP's raw `positionTypes` and
   * `isBigGuy` values, shown unmodified so a reviewer can check the decoded
   * names beside them without reading the downloaded JSON by hand.
   */
  private tpRow(
    entry: TpRawStarPlayerEntry,
    catalogue: Map<string, string>,
  ): TableRow {
    const raw = [
      entry.positionTypes === null
        ? NO_POSITION_TYPES
        : String(entry.positionTypes),
      entry.isBigGuy ? 'yes' : 'no',
    ];
    if (entry.keywordCodes.length === 0) {
      return [entry.rulesSet, NO_KEYWORDS, ...raw];
    }
    let hasUncurated = false;
    const parts = entry.keywordCodes.map((code) => {
      const name = catalogue.get(String(code));
      if (name === undefined) {
        hasUncurated = true;
        return `${code} — not curated`;
      }
      return `${name} (${code})`;
    });
    const cells = [entry.rulesSet, parts.join(', '), ...raw];
    return hasUncurated ? this.html.highlight(cells, [1]) : cells;
  }

  /** The curated catalogue, keyed by its `tourplay.net` code. */
  private async catalogueByCode(): Promise<Map<string, string>> {
    const entries = await this.manual.keywords();
    const byCode = new Map<string, string>();
    for (const entry of entries) {
      if (entry.code !== null) {
        byCode.set(entry.code, entry.name);
      }
    }
    return byCode;
  }
}
