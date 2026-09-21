import type { TableRow } from '@blood-bowl-tracker/review-harness';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import { RaceExternalIdsService } from '../shared/race-external-ids.service';
import type { SampledRace } from '../shared/review.types';
import { ManualRawDataService } from '../source/manual-raw-data.service';
import type { TpRawOfficialPosition } from '../source/tp-raw-official-teams-index.service';
import { TpRawOfficialTeamsIndexService } from '../source/tp-raw-official-teams-index.service';

/** What a cell shows for a position TP gives no keyword codes. */
const NO_KEYWORDS = 'none';

/** What a cell shows for an entry TP carries no numeric positionTypes on. */
const NO_POSITION_TYPES = 'none';

/**
 * The position-keywords raw panel: TP's own numeric keyword codes next to
 * the curated catalogue that names them.
 *
 * Only TP publishes keywords -- BBL has no such concept, so unlike the other
 * raw panels there is no BBL sub-section here. Each row already names the
 * curated keyword alongside its numeric TP code, so the curated catalogue
 * itself is not rendered separately here.
 *
 * Structured exactly like `PositionStartingSkillsRawRendererService`: private
 * `*Section(...)` methods returning `string | null`, joined by `render`.
 */
@Injectable()
export class PositionKeywordsRawRendererService {
  constructor(
    private readonly raceIds: RaceExternalIdsService,
    private readonly tp: TpRawOfficialTeamsIndexService,
    private readonly manual: ManualRawDataService,
    private readonly html: HtmlService,
  ) {}

  async render(race: SampledRace): Promise<string> {
    const catalogue = await this.catalogueByCode();
    const tpSection = await this.tpSection(race, catalogue);
    if (tpSection === null) {
      return this.html.note(`No raw keyword data for race "${race.raceName}".`);
    }
    return tpSection;
  }

  /**
   * Star players are excluded — this tool reviews ordinary positions only.
   * Where a race's official and legacy rosters both carry the same (rules
   * set, position), the official one wins, exactly as the other race-scoped
   * panels resolve the same conflict.
   */
  private async tpSection(
    race: SampledRace,
    catalogue: Map<string, string>,
  ): Promise<string | null> {
    const ids = await this.raceIds.forRace(race.raceId);
    const byKey = new Map<string, TpRawOfficialPosition>();
    for (const code of ids.tp) {
      const tpRace = await this.tp.raceFor(code);
      for (const position of tpRace?.positions ?? []) {
        if (position.isStar) {
          continue;
        }
        const key = `${position.rulesSet} ${position.name}`;
        const existing = byKey.get(key);
        if (
          existing === undefined ||
          (!existing.isOfficial && position.isOfficial)
        ) {
          byKey.set(key, position);
        }
      }
    }
    const rows: TableRow[] = [];
    for (const position of byKey.values()) {
      rows.push(this.tpRow(position, catalogue));
    }
    if (rows.length === 0) {
      return null;
    }
    return (
      this.html.subheading('TP') +
      this.html.table(
        [
          'Position',
          'Rules set',
          'TP keyword codes',
          'positionTypes',
          'isBigGuy',
        ],
        rows,
      )
    );
  }

  /**
   * One position's row. The last two cells are TP's raw `positionTypes` and
   * `isBigGuy` values, shown unmodified so a reviewer can check the decode in
   * the "TP keyword codes" cell beside them without reading the JSON by hand.
   */
  private tpRow(
    position: TpRawOfficialPosition,
    catalogue: Map<string, string>,
  ): TableRow {
    const raw = [
      position.positionTypes === null
        ? NO_POSITION_TYPES
        : String(position.positionTypes),
      position.isBigGuy ? 'yes' : 'no',
    ];
    if (position.keywordCodes.length === 0) {
      return [position.name, position.rulesSet, NO_KEYWORDS, ...raw];
    }
    let hasUncurated = false;
    const parts = position.keywordCodes.map((code) => {
      const name = catalogue.get(String(code));
      if (name === undefined) {
        hasUncurated = true;
        return `${code} — not curated`;
      }
      return `${name} (${code})`;
    });
    const cells = [position.name, position.rulesSet, parts.join(', '), ...raw];
    return hasUncurated ? this.html.highlight(cells, [2]) : cells;
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
