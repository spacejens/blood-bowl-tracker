import type { TableCell, TableRow } from '@blood-bowl-tracker/review-harness';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import type { SampledStarPlayer } from '../shared/review.types';
import type { StarPlayerExternalIdRow } from '../shared/star-player-external-ids.service';
import { StarPlayerExternalIdsService } from '../shared/star-player-external-ids.service';
import { StarPlayerNameMatcherService } from '../shared/star-player-name-matcher.service';
import type { BblRawStarPlayer } from '../source/bbl-raw-star-player-page.service';
import { BblRawStarPlayerPageService } from '../source/bbl-raw-star-player-page.service';
import type { ManualCharacteristicsEntry } from '../source/manual-raw-data.service';
import { ManualRawDataService } from '../source/manual-raw-data.service';
import type { TpRawStarPlayer } from '../source/tp-raw-star-player-index.service';
import { TpRawStarPlayerIndexService } from '../source/tp-raw-star-player-index.service';

const NONE = '—';
const NAME_SYSTEM = 'Name';

/**
 * The star-characteristics raw panel: each source's own view of this star's
 * MA/ST/AG/PA/AV, on its own terms.
 *
 * BBL's page carries a single, undated stat line (labelled "current page
 * values", with no rules-set column of its own); TP publishes one entry per
 * rules set its official lists carry the star in; the curated
 * `position-characteristics.json5`/`position-characteristics-gap-fill.json5`
 * files answer for whichever rules sets they register the star's
 * characteristics for.
 *
 * `HtmlService` and `StarPlayerNameMatcherService` are injected as real
 * providers in this service's spec: both are pure, dependency-free and
 * separately tested, and mocking either would leave the thing under test
 * unasserted.
 */
@Injectable()
export class StarPlayerCharacteristicsRawRendererService {
  constructor(
    private readonly externalIds: StarPlayerExternalIdsService,
    private readonly bbl: BblRawStarPlayerPageService,
    private readonly tp: TpRawStarPlayerIndexService,
    private readonly manual: ManualRawDataService,
    private readonly names: StarPlayerNameMatcherService,
    private readonly html: HtmlService,
  ) {}

  async render(star: SampledStarPlayer): Promise<string> {
    const sections = [
      await this.bblSection(star),
      await this.tpSection(star),
      await this.manualSection(star),
    ].filter((section) => section !== null);

    if (sections.length === 0) {
      return this.html.note(
        `No raw characteristics for star player "${star.positionName}" in BBL, TP or the curated files.`,
      );
    }
    return sections.join('\n');
  }

  /**
   * BBL's page for this star, found the same way as the identity panel: the
   * typID recovered from its external ids is tried first, then a lookup by
   * the stored name for a star whose BBL page listed no races.
   */
  private async bblStar(
    star: SampledStarPlayer,
  ): Promise<BblRawStarPlayer | null> {
    for (const typId of await this.externalIds.bblTypIdsFor(star.positionId)) {
      const found = await this.bbl.starFor(typId);
      if (found !== null) {
        return found;
      }
    }
    return await this.bbl.starForName(star.positionName);
  }

  private async bblSection(star: SampledStarPlayer): Promise<string | null> {
    const found = await this.bblStar(star);
    if (found === null) {
      return null;
    }
    const row: TableRow =
      found.characteristics === null
        ? this.html.highlight([
            'unreadable — no characteristics table on the page',
            NONE,
            NONE,
            NONE,
            NONE,
          ])
        : [
            found.characteristics.move,
            found.characteristics.strength,
            found.characteristics.agility,
            found.characteristics.passing ?? NONE,
            found.characteristics.armour,
          ];
    return (
      this.html.subheading('BBL — current page values') +
      this.html.table(['MA', 'ST', 'AG', 'PA', 'AV'], [row])
    );
  }

  /** TP's entries, one per TP spelling the star's external ids carry. */
  private async tpStars(star: SampledStarPlayer): Promise<TpRawStarPlayer[]> {
    const ids = await this.externalIds.forPosition(star.positionId);
    const spellings = [...new Set([...ids.tp, star.positionName])];
    const found: TpRawStarPlayer[] = [];
    for (const spelling of spellings) {
      const tpStar = await this.tp.starFor(spelling);
      if (tpStar !== null && !found.some((one) => one.name === tpStar.name)) {
        found.push(tpStar);
      }
    }
    return found;
  }

  private async tpSection(star: SampledStarPlayer): Promise<string | null> {
    const stars = await this.tpStars(star);
    const rows: TableCell[][] = stars.flatMap((tpStar) =>
      tpStar.entries.map((entry) => [
        entry.rulesSet,
        ...this.characteristicCells(
          entry.characteristics === null
            ? [null, null, null, null, null]
            : [
                entry.characteristics.move,
                entry.characteristics.strength,
                entry.characteristics.agility,
                entry.characteristics.passing,
                entry.characteristics.armour,
              ],
        ),
      ]),
    );
    if (rows.length === 0) {
      return null;
    }
    return (
      this.html.subheading('TP') +
      this.html.table(['Rules set', 'MA', 'ST', 'AG', 'PA', 'AV'], rows)
    );
  }

  private async manualSection(star: SampledStarPlayer): Promise<string | null> {
    const owned = await this.externalIds.allForPosition(star.positionId);
    const entries = (await this.manual.characteristics()).filter((entry) =>
      this.matchesStar(entry, star, owned),
    );
    if (entries.length === 0) {
      return null;
    }
    const rows: TableCell[][] = entries.map((entry) => [
      entry.rulesSet.id,
      ...this.characteristicCells([
        entry.move,
        entry.strength,
        entry.agility,
        entry.passing,
        entry.armour,
      ]),
    ]);
    return (
      this.html.subheading('Manual curation') +
      this.html.table(['Rules set', 'MA', 'ST', 'AG', 'PA', 'AV'], rows)
    );
  }

  private matchesStar(
    entry: ManualCharacteristicsEntry,
    star: SampledStarPlayer,
    owned: StarPlayerExternalIdRow[],
  ): boolean {
    if (this.names.refMatches(entry.position, owned)) {
      return true;
    }
    return (
      entry.position.system === NAME_SYSTEM &&
      this.names.matchesName(entry.position.id, star.positionName)
    );
  }

  /** MA/ST/AG/PA/AV, each rendered as a dash where the source has no value. */
  private characteristicCells(values: readonly (number | null)[]): TableCell[] {
    return values.map((value) => (value === null ? NONE : String(value)));
  }
}
