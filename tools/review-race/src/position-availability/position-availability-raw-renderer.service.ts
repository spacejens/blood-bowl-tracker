import type { TableCell, TableRow } from '@blood-bowl-tracker/review-harness';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import { BblPositionTypIdsService } from '../shared/bbl-position-typ-ids.service';
import { ManualEntryMatcherService } from '../shared/manual-entry-matcher.service';
import { RaceExternalIdsService } from '../shared/race-external-ids.service';
import type { SampledRace } from '../shared/review.types';
import { BblRawPositionPageService } from '../source/bbl-raw-position-page.service';
import { ManualRawDataService } from '../source/manual-raw-data.service';
import { TpRawRosterIndexService } from '../source/tp-raw-roster-index.service';

/**
 * The position-availability raw panel: which positions each source, on its
 * own, says this race can field. BBL answers per position page ("Can play
 * for:"), TP answers per roster (`lineUpMasters`/`starPlayersMasters`), and
 * the curated `position-availability.json5` answers for the rulebook rosters
 * neither source can evidence.
 *
 * A BBL position page that does not list the race the database says it
 * belongs to gets a highlighted row with an explicit NOT LISTED label — that
 * disagreement is the whole reason this panel exists.
 *
 * `ManualEntryMatcherService` is injected as a real provider in this
 * service's spec: it is pure, dependency-free and separately tested, and
 * mocking it would leave the thing under test unasserted.
 */
@Injectable()
export class PositionAvailabilityRawRendererService {
  constructor(
    private readonly typIds: BblPositionTypIdsService,
    private readonly raceIds: RaceExternalIdsService,
    private readonly bbl: BblRawPositionPageService,
    private readonly tp: TpRawRosterIndexService,
    private readonly manual: ManualRawDataService,
    private readonly matcher: ManualEntryMatcherService,
    private readonly html: HtmlService,
  ) {}

  async render(race: SampledRace): Promise<string> {
    const sections = [
      await this.bblSection(race),
      await this.tpSection(race),
      await this.manualSection(race),
    ].filter((section) => section !== null);
    if (sections.length === 0) {
      return this.html.note(
        `No raw position-availability data for race "${race.raceName}".`,
      );
    }
    return sections.join('\n');
  }

  private async bblSection(race: SampledRace): Promise<string | null> {
    const ids = await this.raceIds.forRace(race.raceId);
    const bblRaceIds = new Set(ids.bbl);
    const typIds = await this.typIds.forRace(race.raceId);
    if (typIds.size === 0) {
      return null;
    }
    const rows: TableRow[] = [];
    for (const [positionName, typId] of typIds) {
      const page = await this.bbl.positionFor(typId);
      if (page === null) {
        rows.push([positionName, typId, 'page not in the mirror', '—']);
        continue;
      }
      const listed = page.races.some((entry) => bblRaceIds.has(entry.bblId));
      const cells: TableCell[] = [
        positionName,
        typId,
        page.name,
        listed ? 'listed' : 'NOT LISTED',
      ];
      rows.push(listed ? cells : this.html.highlight(cells));
    }
    return (
      this.html.subheading('BBL') +
      this.html.table(
        [
          'Stored position',
          'BBL typID',
          'BBL page name',
          'Can play for this race',
        ],
        rows,
      )
    );
  }

  /** Star players are excluded — this tool reviews ordinary positions only. */
  private async tpSection(race: SampledRace): Promise<string | null> {
    const ids = await this.raceIds.forRace(race.raceId);
    const rows: TableCell[][] = [];
    const seen = new Set<number>();
    for (const code of ids.tp) {
      const tpRace = await this.tp.raceFor(code);
      for (const position of tpRace?.positions ?? []) {
        if (seen.has(position.tpPositionId) || position.isStar) {
          continue;
        }
        seen.add(position.tpPositionId);
        rows.push([code, String(position.tpPositionId), position.name]);
      }
    }
    if (rows.length === 0) {
      return null;
    }
    return (
      this.html.subheading('TP') +
      this.html.table(['teamRace code', 'TP position id', 'Position'], rows)
    );
  }

  private async manualSection(race: SampledRace): Promise<string | null> {
    const owned = await this.raceIds.allForRace(race.raceId);
    const rows: TableCell[][] = [];
    for (const entry of await this.manual.availability()) {
      for (const pair of entry.raceEras) {
        if (this.matcher.refMatchesRace(pair.race, owned)) {
          rows.push([entry.name, `${pair.era.system}: ${pair.era.id}`]);
        }
      }
    }
    if (rows.length === 0) {
      return null;
    }
    return (
      this.html.subheading('Manual curation') +
      this.html.table(['Curated position', 'Era'], rows)
    );
  }
}
