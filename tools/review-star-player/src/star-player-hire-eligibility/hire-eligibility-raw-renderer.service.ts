import type { TableCell } from '@blood-bowl-tracker/review-harness';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import type { SampledStarPlayer } from '../shared/review.types';
import { StarPlayerExternalIdsService } from '../shared/star-player-external-ids.service';
import { StarPlayerNameMatcherService } from '../shared/star-player-name-matcher.service';
import { StarPlayerPositionsQueryService } from '../shared/star-player-positions-query.service';
import type {
  BblStarLookup,
  TpStarsLookup,
} from '../shared/star-source-lookup.service';
import { StarSourceLookupService } from '../shared/star-source-lookup.service';
import { ManualRawDataService } from '../source/manual-raw-data.service';
import type { TpRawStarPlayer } from '../source/tp-raw-star-player-index.service';

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
    private readonly lookup: StarSourceLookupService,
    private readonly manual: ManualRawDataService,
    private readonly names: StarPlayerNameMatcherService,
    private readonly html: HtmlService,
  ) {}

  async render(star: SampledStarPlayer): Promise<string> {
    const bblLookup = await this.lookup.bblStarFor(star);
    const tpLookup = await this.lookup.tpStarsFor(star);
    const sections = [
      this.bblSection(bblLookup),
      this.tpSection(tpLookup),
      await this.manualSection(star),
    ].filter((section) => section !== null);

    const verdict = await this.verdictSection(star, tpLookup.stars);
    return [...sections, verdict].filter((part) => part !== null).join('\n');
  }

  private bblSection(lookup: BblStarLookup): string {
    if (lookup.star === null) {
      return (
        this.html.subheading('BBL') +
        this.html.table(
          ['Can play for'],
          [this.html.highlight([lookup.notFoundNote])],
        )
      );
    }
    return (
      this.html.subheading('BBL') +
      this.html.note(
        'BBL states eligibility as a team special rule, not as a race list.',
      ) +
      this.html.table(['Can play for'], [[lookup.star.canPlayFor ?? NONE]])
    );
  }

  private tpSection(lookup: TpStarsLookup): string {
    if (lookup.stars.length === 0) {
      return (
        this.html.subheading('TP') +
        this.html.table(
          ['Rules set', 'teamRace code', 'Special rule'],
          [this.html.highlight([lookup.notFoundNote, NONE, NONE])],
        )
      );
    }
    const rows: TableCell[][] = lookup.stars.flatMap((star) =>
      star.entries.flatMap((entry) =>
        entry.eligibleTeamRaces.map((code) => [
          entry.rulesSet,
          code,
          entry.specialRuleName ?? NONE,
        ]),
      ),
    );
    return (
      this.html.subheading('TP') +
      this.html.table(
        ['Rules set', 'teamRace code', 'Special rule'],
        rows.length === 0
          ? [
              this.html.highlight([
                'TP entry has no eligible teamRace codes',
                NONE,
                NONE,
              ]),
            ]
          : rows,
      )
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
   *
   * A count-only comparison, not a full race-identity comparison — the two
   * sides could carry the same COUNT of distinct races while disagreeing on
   * which races those are, and this verdict cannot see that. A DB count
   * higher than TP's is `WIDER IN DB`; a DB count lower than TP's is its own
   * distinct `NARROWER IN DB` case — the mercenary-vs-embedded stratifier's
   * own doc comment names "a wrongly narrow eligibility row" as a real
   * concern, so a DB that under-claims must not read the same as one that
   * matches. Equal counts are labelled accordingly, not "consistent" — that
   * word claims more than a count comparison can support. Full race-identity
   * comparison is a deliberate follow-up, not implemented here.
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
    const narrower = dbRaces.size < tpCodes.size;
    const verdict = wider
      ? 'WIDER IN DB'
      : narrower
        ? 'NARROWER IN DB'
        : 'counts match (race identity not compared)';
    const cells: TableCell[] = [
      String(dbRaces.size),
      String(tpCodes.size),
      verdict,
    ];
    return (
      this.html.subheading('Race-count comparison') +
      this.html.table(
        ['DB distinct races', 'TP distinct teamRace codes', 'Verdict'],
        [wider || narrower ? this.html.highlight(cells) : cells],
      )
    );
  }
}
