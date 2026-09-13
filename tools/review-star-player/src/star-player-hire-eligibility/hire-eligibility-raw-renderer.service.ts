import type { TableCell } from '@blood-bowl-tracker/review-harness';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import type { SampledStarPlayer } from '../shared/review.types';
import { StarPlayerExternalIdsService } from '../shared/star-player-external-ids.service';
import { StarPlayerNameMatcherService } from '../shared/star-player-name-matcher.service';
import { StarPlayerPositionsQueryService } from '../shared/star-player-positions-query.service';
import type { BblRawStarPlayer } from '../source/bbl-raw-star-player-page.service';
import { BblRawStarPlayerPageService } from '../source/bbl-raw-star-player-page.service';
import { ManualRawDataService } from '../source/manual-raw-data.service';
import type { TpRawStarPlayer } from '../source/tp-raw-star-player-index.service';
import { TpRawStarPlayerIndexService } from '../source/tp-raw-star-player-index.service';

const NONE = '—';

/**
 * The hire-eligibility raw panel: which races/rosters each source, on its
 * own, says may hire this star, plus the one comparison a reviewer would
 * otherwise have to do by eye — whether the database's `positions_race_eras`
 * rows claim more races than TP's own masks support.
 *
 * BBL answers with a single "Can play for:" line phrased as a team special
 * rule, not a race list, so its sub-section is shown verbatim with a note
 * explaining that difference in kind rather than compared directly. TP
 * answers per rules set with the `teamRace` codes its bitmasks resolve to.
 * The curated `position-availability.json5` answers with explicit
 * `(race, era)` pairs for whichever entries a reviewer has pinned by hand.
 *
 * `HtmlService` and `StarPlayerNameMatcherService` are injected as real
 * providers in this service's spec: both are pure, dependency-free and
 * separately tested, and mocking either would leave the thing under test
 * unasserted.
 */
@Injectable()
export class HireEligibilityRawRendererService {
  constructor(
    private readonly query: StarPlayerPositionsQueryService,
    private readonly externalIds: StarPlayerExternalIdsService,
    private readonly bbl: BblRawStarPlayerPageService,
    private readonly tp: TpRawStarPlayerIndexService,
    private readonly manual: ManualRawDataService,
    private readonly names: StarPlayerNameMatcherService,
    private readonly html: HtmlService,
  ) {}

  async render(star: SampledStarPlayer): Promise<string> {
    const bblStar = await this.bblStar(star);
    const tpStars = await this.tpStars(star);
    const sections = [
      this.bblSection(bblStar),
      this.tpSection(tpStars),
      await this.manualSection(star),
    ].filter((section) => section !== null);

    if (sections.length === 0) {
      return this.html.note(
        `No raw hire-eligibility data for star player "${star.positionName}".`,
      );
    }
    const verdict = await this.verdictSection(star, tpStars);
    return [...sections, verdict].filter((part) => part !== null).join('\n');
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

  private bblSection(star: BblRawStarPlayer | null): string | null {
    if (star === null) {
      return null;
    }
    return (
      this.html.subheading('BBL') +
      this.html.note(
        'BBL states eligibility as a team special rule, not as a race list.',
      ) +
      this.html.table(['Can play for'], [[star.canPlayFor ?? NONE]])
    );
  }

  private tpSection(stars: TpRawStarPlayer[]): string | null {
    const rows: TableCell[][] = stars.flatMap((star) =>
      star.entries.flatMap((entry) =>
        entry.eligibleTeamRaces.map((code) => [
          entry.rulesSet,
          code,
          entry.specialRuleName ?? NONE,
        ]),
      ),
    );
    if (rows.length === 0) {
      return null;
    }
    return (
      this.html.subheading('TP') +
      this.html.table(['Rules set', 'teamRace code', 'Special rule'], rows)
    );
  }

  private async manualSection(star: SampledStarPlayer): Promise<string | null> {
    const owned = await this.externalIds.allForPosition(star.positionId);
    const rows: TableCell[][] = [];
    for (const entry of await this.manual.availability()) {
      if (
        !this.names.matchesName(entry.name, star.positionName) &&
        !entry.externalIds.some((ref) => this.names.refMatches(ref, owned))
      ) {
        continue;
      }
      for (const pair of entry.raceEras) {
        rows.push([
          `${pair.race.system}: ${pair.race.id}`,
          `${pair.era.system}: ${pair.era.id}`,
        ]);
      }
    }
    if (rows.length === 0) {
      return null;
    }
    return (
      this.html.subheading('Manual curation') +
      this.html.table(['Race', 'Era'], rows)
    );
  }

  /**
   * TP's distinct `teamRace` codes beside the database's distinct race
   * count. Rendered only when TP carries at least one code for the star —
   * with none, there is nothing to compare against.
   */
  private async verdictSection(
    star: SampledStarPlayer,
    tpStars: TpRawStarPlayer[],
  ): Promise<string | null> {
    const tpCodes = new Set(
      tpStars.flatMap((tpStar) =>
        tpStar.entries.flatMap((entry) => entry.eligibleTeamRaces),
      ),
    );
    if (tpCodes.size === 0) {
      return null;
    }
    const dbRows = await this.query.hireEligibilityFor(star.positionId);
    const dbRaces = new Set(dbRows.map((row) => row.raceId));
    const wider = dbRaces.size > tpCodes.size;
    const cells: TableCell[] = [
      String(dbRaces.size),
      String(tpCodes.size),
      wider ? 'WIDER IN DB' : 'consistent',
    ];
    return (
      this.html.subheading('Race-count comparison') +
      this.html.table(
        ['DB distinct races', 'TP distinct teamRace codes', 'Verdict'],
        [wider ? this.html.highlight(cells) : cells],
      )
    );
  }
}
