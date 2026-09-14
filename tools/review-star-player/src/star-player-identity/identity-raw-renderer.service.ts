import type { TableCell, TableRow } from '@blood-bowl-tracker/review-harness';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import type { SampledStarPlayer } from '../shared/review.types';
import { StarPlayerExternalIdsService } from '../shared/star-player-external-ids.service';
import { StarPlayerNameMatcherService } from '../shared/star-player-name-matcher.service';
import type {
  BblStarLookup,
  TpStarsLookup,
} from '../shared/star-source-lookup.service';
import { StarSourceLookupService } from '../shared/star-source-lookup.service';
import type { BblRawStarPlayer } from '../source/bbl-raw-star-player-page.service';
import { ManualRawDataService } from '../source/manual-raw-data.service';
import type { TpRawStarPlayer } from '../source/tp-raw-star-player-index.service';

/**
 * The star-identity raw panel: what each source, on its own, calls this star
 * and what it charges for it — plus the one comparison a reviewer would
 * otherwise have to do by eye, whether BBL's and TP's spellings agree once
 * apostrophe style, case and a duo star's parenthesised partner are
 * accounted for.
 *
 * `HtmlService` and `StarPlayerNameMatcherService` are injected as real
 * providers in this service's spec: both are pure, dependency-free and
 * separately tested, and mocking either would leave the thing under test
 * unasserted.
 */
@Injectable()
export class StarPlayerIdentityRawRendererService {
  constructor(
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

    const agreement = this.agreementSection(bblLookup.star, tpLookup.stars);
    return [...sections, agreement].filter((part) => part !== null).join('\n');
  }

  private bblSection(lookup: BblStarLookup): string {
    const rows: TableRow[] =
      lookup.star === null
        ? [this.html.highlight(['BBL', lookup.notFoundNote])]
        : [
            ['BBL typID', lookup.star.typId],
            ['Page name', lookup.star.name],
            ['Inducement price', lookup.star.cost ?? '—'],
            ['Can play for', lookup.star.canPlayFor ?? '—'],
            ['Skills', lookup.star.skills ?? '—'],
          ];
    return (
      this.html.subheading('BBL') + this.html.table(['Field', 'Value'], rows)
    );
  }

  private tpSection(lookup: TpStarsLookup): string {
    if (lookup.stars.length === 0) {
      return (
        this.html.subheading('TP') +
        this.html.table(
          ['TP name', 'Rules set', 'Cost', 'Special rule', 'Eligible rosters'],
          [this.html.highlight([lookup.notFoundNote, '—', '—', '—', '—'])],
        )
      );
    }
    const rows: TableCell[][] = lookup.stars.flatMap((star) =>
      star.entries.map((entry) => [
        star.name,
        entry.rulesSet,
        entry.cost === null ? '—' : String(entry.cost),
        entry.specialRuleName ?? '—',
        String(entry.eligibleTeamRaces.length),
      ]),
    );
    return (
      this.html.subheading('TP') +
      this.html.table(
        ['TP name', 'Rules set', 'Cost', 'Special rule', 'Eligible rosters'],
        rows,
      )
    );
  }

  private async manualSection(star: SampledStarPlayer): Promise<string> {
    const owned = await this.externalIds.allForPosition(star.positionId);
    const entries = (await this.manual.starPlayers()).filter(
      (entry) =>
        this.names.matchesName(entry.name, star.positionName) ||
        entry.externalIds.some((ref) => this.names.refMatches(ref, owned)),
    );
    const rows: TableRow[] =
      entries.length === 0
        ? [
            this.html.highlight([
              `no curated entry found for "${star.positionName}"`,
              '—',
            ]),
          ]
        : entries.map((entry) => [
            entry.name,
            entry.externalIds.map((ref) => `${ref.system}: ${ref.id}`),
          ]);
    return (
      this.html.subheading('Manual curation') +
      this.html.table(['Curated name', 'Registered external ids'], rows)
    );
  }

  /**
   * BBL's and TP's own spellings side by side, one row per TP record — TP
   * can carry a star under several deduplicated spellings, and a mismatch
   * carried by a later one must not be hidden behind an earlier one that
   * agrees. Apostrophe style, quote style, case and a duo star's
   * parenthesised partner are known, expected differences and never a
   * mismatch on their own; anything else is, and gets a highlighted row
   * carrying an explicit MISMATCH label so the report stays readable without
   * colour.
   */
  private agreementSection(
    bblStar: BblRawStarPlayer | null,
    tpStars: TpRawStarPlayer[],
  ): string | null {
    if (bblStar === null || tpStars.length === 0) {
      return null;
    }
    const rows: TableRow[] = tpStars.map((tpStar) => {
      const agrees = this.names.matchesName(bblStar.name, tpStar.name);
      const cells: TableCell[] = [
        bblStar.name,
        tpStar.name,
        agrees ? 'agree' : 'MISMATCH',
      ];
      return agrees ? cells : this.html.highlight(cells);
    });
    return (
      this.html.subheading('BBL / TP name agreement') +
      this.html.table(['BBL name', 'TP name', 'Verdict'], rows)
    );
  }
}
