import type { TableCell, TableRow } from '@blood-bowl-tracker/review-harness';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import type { SampledStarPlayer } from '../shared/review.types';
import { StarPlayerExternalIdsService } from '../shared/star-player-external-ids.service';
import { StarPlayerNameMatcherService } from '../shared/star-player-name-matcher.service';
import type { BblRawStarPlayer } from '../source/bbl-raw-star-player-page.service';
import { BblRawStarPlayerPageService } from '../source/bbl-raw-star-player-page.service';
import { ManualRawDataService } from '../source/manual-raw-data.service';
import type { TpRawStarPlayer } from '../source/tp-raw-star-player-index.service';
import { TpRawStarPlayerIndexService } from '../source/tp-raw-star-player-index.service';

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
        `No raw data for star player "${star.positionName}" in BBL, TP or the curated files.`,
      );
    }
    const agreement = this.agreementSection(bblStar, tpStars);
    return [...sections, agreement].filter((part) => part !== null).join('\n');
  }

  /**
   * BBL's page for this star. The typID recovered from its external ids is
   * tried first; a star whose BBL page listed no races carries no BBL id at
   * all, so the stored name is looked up against the mirror sweep instead.
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
    const rows: TableCell[][] = [
      ['BBL typID', star.typId],
      ['Page name', star.name],
      ['Inducement price', star.cost ?? '—'],
      ['Can play for', star.canPlayFor ?? '—'],
      ['Skills', star.skills ?? '—'],
    ];
    return (
      this.html.subheading('BBL') + this.html.table(['Field', 'Value'], rows)
    );
  }

  private tpSection(stars: TpRawStarPlayer[]): string | null {
    if (stars.length === 0) {
      return null;
    }
    const rows: TableCell[][] = stars.flatMap((star) =>
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

  private async manualSection(star: SampledStarPlayer): Promise<string | null> {
    const owned = await this.externalIds.allForPosition(star.positionId);
    const entries = (await this.manual.starPlayers()).filter(
      (entry) =>
        this.names.matchesName(entry.name, star.positionName) ||
        entry.externalIds.some((ref) => this.names.refMatches(ref, owned)),
    );
    if (entries.length === 0) {
      return null;
    }
    const rows: TableCell[][] = entries.map((entry) => [
      entry.name,
      entry.externalIds.map((ref) => `${ref.system}: ${ref.id}`),
    ]);
    return (
      this.html.subheading('Manual curation') +
      this.html.table(['Curated name', 'Registered external ids'], rows)
    );
  }

  /**
   * BBL's and TP's own spellings side by side. Apostrophe style, quote style,
   * case and a duo star's parenthesised partner are known, expected
   * differences and never a mismatch on their own; anything else is, and gets
   * a highlighted row carrying an explicit MISMATCH label so the report stays
   * readable without colour.
   */
  private agreementSection(
    bblStar: BblRawStarPlayer | null,
    tpStars: TpRawStarPlayer[],
  ): string | null {
    const tpName = tpStars[0]?.name;
    if (bblStar === null || tpName === undefined) {
      return null;
    }
    const agrees = this.names.matchesName(bblStar.name, tpName);
    const cells: TableCell[] = [
      bblStar.name,
      tpName,
      agrees ? 'agree' : 'MISMATCH',
    ];
    const row: TableRow = agrees ? cells : this.html.highlight(cells);
    return (
      this.html.subheading('BBL / TP name agreement') +
      this.html.table(['BBL name', 'TP name', 'Verdict'], [row])
    );
  }
}
