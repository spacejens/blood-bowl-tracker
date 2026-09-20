import type { TableRow } from '@blood-bowl-tracker/review-harness';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import type { SampledPlayer } from '../shared/review.types';
import { ManualRawKeywordsService } from '../source/manual-raw-keywords.service';
import { TpRawPlayerIndexService } from '../source/tp-raw-player-index.service';

/** What a cell shows for a player template TP gives no keyword codes. */
const NO_KEYWORDS = 'none';

/**
 * The player-keywords raw panel: the BB2025 keyword codes of the position
 * template this player was recruited from -- TP's `lineUps[].lineUpMaster.race`
 * -- next to the curated catalogue that names them.
 *
 * Only TP publishes keyword codes at all -- BBL has no such concept -- so
 * there is no BBL sub-section here, unlike the other raw panels. A player
 * with no `templateKeywordCodes` (no downloaded TP roster file carries them,
 * whether or not any match file does) gets a single note and no table at all:
 * there is nothing to show or compare against.
 */
@Injectable()
export class PlayerKeywordsRawRendererService {
  constructor(
    private readonly index: TpRawPlayerIndexService,
    private readonly manual: ManualRawKeywordsService,
    private readonly html: HtmlService,
  ) {}

  async render(player: SampledPlayer): Promise<string> {
    const aggregate = await this.index.aggregateFor(player.externalId);
    const codes = aggregate?.templateKeywordCodes ?? null;
    if (codes === null) {
      return this.html.note(
        'No downloaded TP roster file carries this player.',
      );
    }
    const entries = await this.manual.all();
    const catalogue = this.catalogueByCode(entries);
    const templateTable = this.html.table(
      ['Source', 'TP keyword codes'],
      [this.templateRow(codes, catalogue)],
    );
    const manualTable = this.manualSection(entries);
    return manualTable === null
      ? templateTable
      : `${templateTable}\n${manualTable}`;
  }

  private templateRow(
    codes: number[],
    catalogue: Map<string, string>,
  ): TableRow {
    if (codes.length === 0) {
      return ['Template', NO_KEYWORDS];
    }
    let hasUncurated = false;
    const parts = codes.map((code) => {
      const name = catalogue.get(String(code));
      if (name === undefined) {
        hasUncurated = true;
        return `${code} — not curated`;
      }
      return `${name} (${code})`;
    });
    const cell = parts.join(', ');
    return hasUncurated
      ? this.html.highlight(['Template', cell], [1])
      : ['Template', cell];
  }

  /** The whole curated catalogue, rendered once as its own sub-table. */
  private manualSection(
    entries: { name: string; kind: string; code: string | null }[],
  ): string | null {
    if (entries.length === 0) {
      return null;
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
  private catalogueByCode(
    entries: { name: string; kind: string; code: string | null }[],
  ): Map<string, string> {
    const byCode = new Map<string, string>();
    for (const entry of entries) {
      if (entry.code !== null) {
        byCode.set(entry.code, entry.name);
      }
    }
    return byCode;
  }
}
