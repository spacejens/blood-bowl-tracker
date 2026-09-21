import type { Db } from '@blood-bowl-tracker/db';
import { and, DB, eq, playerExternalIds } from '@blood-bowl-tracker/db';
import type { TableRow } from '@blood-bowl-tracker/review-harness';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Inject, Injectable } from '@nestjs/common';

import { ExternalSystemLookupService } from '../shared/external-system-lookup.service';
import type { SampledPlayer } from '../shared/review.types';
import { ManualRawKeywordsService } from '../source/manual-raw-keywords.service';
import { TpRawPlayerIndexService } from '../source/tp-raw-player-index.service';

/** What a cell shows for a player template TP gives no keyword codes. */
const NO_KEYWORDS = 'none';

/** What a cell shows for a template TP carries no numeric positionTypes on. */
const NO_POSITION_TYPES = 'none';

/** The template row's raw `positionTypes` and `isBigGuy` values. */
interface TemplateRowInput {
  codes: number[];
  positionTypes: number | null;
  isBigGuy: boolean | null;
  catalogue: Map<string, string>;
}

/**
 * The player-keywords raw panel: the BB2025 keyword codes of the position
 * template this player was recruited from -- merged from TP's
 * `lineUps[].lineUpMaster.race`, `positionTypes` and `isBigGuy` -- next to
 * the curated catalogue that names them.
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
    private readonly externalSystems: ExternalSystemLookupService,
    @Inject(DB) private readonly db: Db,
    private readonly html: HtmlService,
  ) {}

  async render(player: SampledPlayer): Promise<string> {
    const tpExternalId = await this.tpExternalIdFor(player);
    if (tpExternalId === null) {
      return this.html.note(
        'No downloaded TP roster file carries this player.',
      );
    }
    const aggregate = await this.index.aggregateFor(tpExternalId);
    const codes = aggregate?.templateKeywordCodes ?? null;
    if (codes === null) {
      return this.html.note(
        'No downloaded TP roster file carries this player.',
      );
    }
    const entries = await this.manual.all();
    const catalogue = this.catalogueByCode(entries);
    const templateTable = this.html.table(
      ['Source', 'TP keyword codes', 'positionTypes', 'isBigGuy'],
      [
        this.templateRow({
          codes,
          positionTypes: aggregate?.templatePositionTypes ?? null,
          isBigGuy: aggregate?.templateIsBigGuy ?? null,
          catalogue,
        }),
      ],
    );
    const manualTable = this.manualSection(entries);
    return manualTable === null
      ? templateTable
      : `${templateTable}\n${manualTable}`;
  }

  /**
   * The player's own `tourplay.net` external id, needed regardless of which
   * source the sample came from: keyword codes are TP-only, so a BBL-sourced
   * player's own `externalId` (a BBL `pid`) is never a valid TP line-up id.
   * A player already sampled from `tp` already carries the right id, so only
   * a non-TP sample needs the extra lookup.
   */
  private async tpExternalIdFor(player: SampledPlayer): Promise<string | null> {
    if (player.source === 'tp') {
      return player.externalId;
    }
    const tpSystemId = await this.externalSystems.getSystemId('tp');
    const [row] = await this.db
      .select({ externalId: playerExternalIds.externalId })
      .from(playerExternalIds)
      .where(
        and(
          eq(playerExternalIds.playerId, player.playerId),
          eq(playerExternalIds.externalSystemId, tpSystemId),
        ),
      )
      .limit(1);
    return row?.externalId ?? null;
  }

  /**
   * The template's row. The last two cells are TP's raw `positionTypes` and
   * `isBigGuy` values, shown unmodified so a reviewer can check the decoded
   * names beside them without reading the downloaded JSON by hand.
   */
  private templateRow(input: TemplateRowInput): TableRow {
    const raw = [
      input.positionTypes === null
        ? NO_POSITION_TYPES
        : String(input.positionTypes),
      input.isBigGuy === true ? 'yes' : 'no',
    ];
    if (input.codes.length === 0) {
      return ['Template', NO_KEYWORDS, ...raw];
    }
    let hasUncurated = false;
    const parts = input.codes.map((code) => {
      const name = input.catalogue.get(String(code));
      if (name === undefined) {
        hasUncurated = true;
        return `${code} — not curated`;
      }
      return `${name} (${code})`;
    });
    const cells = ['Template', parts.join(', '), ...raw];
    return hasUncurated ? this.html.highlight(cells, [1]) : cells;
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
