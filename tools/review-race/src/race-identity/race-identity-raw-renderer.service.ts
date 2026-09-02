import type { TableCell, TableRow } from '@blood-bowl-tracker/review-harness';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import { ManualEntryMatcherService } from '../shared/manual-entry-matcher.service';
import { RaceExternalIdsService } from '../shared/race-external-ids.service';
import { RaceNameComparisonService } from '../shared/race-name-comparison.service';
import type { SampledRace } from '../shared/review.types';
import { BblRawRaceIndexService } from '../source/bbl-raw-race-index.service';
import { ManualRawDataService } from '../source/manual-raw-data.service';
import { TpRawRosterIndexService } from '../source/tp-raw-roster-index.service';

/**
 * The race-identity raw panel: what each source, on its own, says this race
 * is called and how much of it that source carries — plus the one comparison
 * a reviewer would otherwise have to do by eye, whether BBL's and TP's names
 * agree once BBL's "<Race> Team(s)" suffix convention is accounted for.
 *
 * `HtmlService`, `RaceNameComparisonService` and `ManualEntryMatcherService`
 * are injected as real providers in this service's spec: all three are pure,
 * dependency-free and separately tested, and mocking any of them would leave
 * the thing under test unasserted.
 */
@Injectable()
export class RaceIdentityRawRendererService {
  constructor(
    private readonly externalIds: RaceExternalIdsService,
    private readonly bbl: BblRawRaceIndexService,
    private readonly tp: TpRawRosterIndexService,
    private readonly manual: ManualRawDataService,
    private readonly names: RaceNameComparisonService,
    private readonly matcher: ManualEntryMatcherService,
    private readonly html: HtmlService,
  ) {}

  async render(race: SampledRace): Promise<string> {
    const ids = await this.externalIds.forRace(race.raceId);
    const bblRaces = await Promise.all(
      ids.bbl.map(async (id) => await this.bbl.raceFor(id)),
    );
    const tpRaces = await Promise.all(
      ids.tp.map(async (code) => await this.tp.raceFor(code)),
    );
    const sections = [
      this.bblSection(ids.bbl, bblRaces),
      this.tpSection(ids.tp, tpRaces),
      await this.manualSection(race),
    ].filter((section) => section !== null);

    if (sections.length === 0) {
      return this.html.note(
        `No raw data for race "${race.raceName}" in BBL, TP or the curated files.`,
      );
    }
    const agreement = this.agreementSection(bblRaces, tpRaces);
    return [...sections, agreement].filter((part) => part !== null).join('\n');
  }

  private bblSection(
    bblIds: string[],
    races: Awaited<ReturnType<BblRawRaceIndexService['raceFor']>>[],
  ): string | null {
    if (bblIds.length === 0) {
      return null;
    }
    const rows: TableCell[][] = bblIds.map((id, index) => {
      const race = races[index];
      return race === null || race === undefined
        ? [id, 'not in the mirror', '—', '0', '—']
        : [
            id,
            race.listName ?? '—',
            race.teamPageName ?? '—',
            String(race.teamPageCount),
            this.teamCodesCell(race.teamCodes, race.teamPageCount),
          ];
    });
    return (
      this.html.subheading('BBL') +
      this.html.table(
        [
          'BBL race id',
          'Race-list name',
          'Team-page name',
          'Team pages',
          'Team codes',
        ],
        rows,
      )
    );
  }

  /**
   * `race.teamCodes` is already capped at `BblRawRaceIndexService`'s display
   * limit, so a race with more team pages than codes shown gets an explicit
   * "and N more" suffix naming how many were left out, using the
   * uncapped `teamPageCount` the source already tracks.
   */
  private teamCodesCell(teamCodes: string[], teamPageCount: number): string {
    if (teamCodes.length === 0) {
      return '—';
    }
    const omitted = teamPageCount - teamCodes.length;
    const joined = teamCodes.join(', ');
    return omitted > 0 ? `${joined} (and ${omitted} more)` : joined;
  }

  private tpSection(
    tpCodes: string[],
    races: Awaited<ReturnType<TpRawRosterIndexService['raceFor']>>[],
  ): string | null {
    if (tpCodes.length === 0) {
      return null;
    }
    const rows: TableCell[][] = tpCodes.map((code, index) => {
      const race = races[index];
      return race === null || race === undefined
        ? [code, 'no roster file carries this code', '0', '0']
        : [
            code,
            race.rosterName ?? '—',
            String(race.rosterCount),
            String(race.positions.length),
          ];
    });
    return (
      this.html.subheading('TP') +
      this.html.table(
        ['teamRace code', 'rosterMaster.name', 'Rosters', 'Positions'],
        rows,
      )
    );
  }

  private async manualSection(race: SampledRace): Promise<string | null> {
    const owned = await this.externalIds.allForRace(race.raceId);
    const entries = (await this.manual.races()).filter((entry) =>
      this.matcher.matchesRace(entry, race.raceName, owned),
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
   * BBL's and TP's own names for this race, side by side. BBL names a race
   * "<Race> Team(s)" and TP names it "<Race>", so that difference alone is
   * never a mismatch; anything else is, and gets a highlighted row carrying
   * an explicit MISMATCH label so the report stays readable without colour.
   */
  private agreementSection(
    bblRaces: Awaited<ReturnType<BblRawRaceIndexService['raceFor']>>[],
    tpRaces: Awaited<ReturnType<TpRawRosterIndexService['raceFor']>>[],
  ): string | null {
    const bblName = bblRaces
      .map((race) => race?.listName ?? race?.teamPageName ?? null)
      .find((name) => name !== null);
    const tpName = tpRaces
      .map((race) => race?.rosterName ?? null)
      .find((name) => name !== null);
    if (
      bblName === undefined ||
      bblName === null ||
      tpName === undefined ||
      tpName === null
    ) {
      return null;
    }
    const agrees = this.names.agree(bblName, tpName);
    const cells: TableCell[] = [bblName, tpName, agrees ? 'agree' : 'MISMATCH'];
    const row: TableRow = agrees ? cells : this.html.highlight(cells);
    return (
      this.html.subheading('BBL / TP name agreement') +
      this.html.table(['BBL name', 'TP name', 'Verdict'], [row])
    );
  }
}
