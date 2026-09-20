import type { TableRow } from '@blood-bowl-tracker/review-harness';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import type { SampledStarPlayer } from '../shared/review.types';
import { StarSourceLookupService } from '../shared/star-source-lookup.service';
import { ManualRawDataService } from '../source/manual-raw-data.service';
import type { TpRawStarPlayerEntry } from '../source/tp-raw-star-player-index.service';

/** What a cell shows for a star TP gives no keyword codes. */
const NO_KEYWORDS = 'none';

/**
 * The star-keywords raw panel: TP's own numeric keyword codes for this star,
 * next to the curated catalogue that names them.
 *
 * Only TP publishes keywords -- BBL has no such concept, so unlike the other
 * raw panels there is no BBL sub-section here. The curated catalogue is
 * rendered once, as its own sub-table, rather than per rules set: it is a
 * fixed reference a reviewer checks codes against, not a per-star fact.
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
    return [
      await this.tpSection(star, catalogue),
      await this.manualSection(),
    ].join('\n');
  }

  private async tpSection(
    star: SampledStarPlayer,
    catalogue: Map<string, string>,
  ): Promise<string> {
    const lookup = await this.lookup.tpStarsFor(star);
    if (lookup.stars.length === 0) {
      return (
        this.html.subheading('TP') +
        this.html.table(
          ['Rules set', 'TP keyword codes'],
          [this.html.highlight([lookup.notFoundNote, NO_KEYWORDS])],
        )
      );
    }
    const rows: TableRow[] = [];
    for (const tpStar of lookup.stars) {
      for (const entry of tpStar.entries) {
        rows.push(this.tpRow(entry, catalogue));
      }
    }
    return (
      this.html.subheading('TP') +
      this.html.table(['Rules set', 'TP keyword codes'], rows)
    );
  }

  private tpRow(
    entry: TpRawStarPlayerEntry,
    catalogue: Map<string, string>,
  ): TableRow {
    if (entry.keywordCodes.length === 0) {
      return [entry.rulesSet, NO_KEYWORDS];
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
    const cell = parts.join(', ');
    return hasUncurated
      ? this.html.highlight([entry.rulesSet, cell], [1])
      : [entry.rulesSet, cell];
  }

  /** The whole curated catalogue, rendered once rather than per rules set. */
  private async manualSection(): Promise<string> {
    const entries = await this.manual.keywords();
    if (entries.length === 0) {
      return '';
    }
    const rows: TableRow[] = entries.map((entry) => [
      entry.name,
      entry.kind,
      entry.code ?? NO_KEYWORDS,
    ]);
    return (
      this.html.subheading('Manual curation') +
      this.html.table(['Keyword', 'Kind', 'TP code'], rows)
    );
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
