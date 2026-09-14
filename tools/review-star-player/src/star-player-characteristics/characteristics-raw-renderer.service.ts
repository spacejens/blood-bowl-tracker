import type { TableCell, TableRow } from '@blood-bowl-tracker/review-harness';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import type { SampledStarPlayer } from '../shared/review.types';
import type { StarPlayerExternalIdRow } from '../shared/star-player-external-ids.service';
import { StarPlayerExternalIdsService } from '../shared/star-player-external-ids.service';
import { StarPlayerNameMatcherService } from '../shared/star-player-name-matcher.service';
import { StarSourceLookupService } from '../shared/star-source-lookup.service';
import type { ManualCharacteristicsEntry } from '../source/manual-raw-data.service';
import { ManualRawDataService } from '../source/manual-raw-data.service';

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
    private readonly lookup: StarSourceLookupService,
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
    return sections.join('\n');
  }

  private async bblSection(star: SampledStarPlayer): Promise<string> {
    const found = await this.lookup.bblStarFor(star);
    const row: TableRow =
      found.star === null
        ? this.html.highlight([found.notFoundNote, NONE, NONE, NONE, NONE])
        : found.star.characteristics === null
          ? this.html.highlight([
              'unreadable — no characteristics table on the page',
              NONE,
              NONE,
              NONE,
              NONE,
            ])
          : [
              found.star.characteristics.move,
              found.star.characteristics.strength,
              found.star.characteristics.agility,
              found.star.characteristics.passing ?? NONE,
              found.star.characteristics.armour,
            ];
    return (
      this.html.subheading('BBL — current page values') +
      this.html.table(['MA', 'ST', 'AG', 'PA', 'AV'], [row])
    );
  }

  private async tpSection(star: SampledStarPlayer): Promise<string> {
    const lookup = await this.lookup.tpStarsFor(star);
    if (lookup.stars.length === 0) {
      return (
        this.html.subheading('TP') +
        this.html.table(
          ['Rules set', 'MA', 'ST', 'AG', 'PA', 'AV'],
          [
            this.html.highlight([
              lookup.notFoundNote,
              NONE,
              NONE,
              NONE,
              NONE,
              NONE,
            ]),
          ],
        )
      );
    }
    const rows: TableCell[][] = lookup.stars.flatMap((tpStar) =>
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
