import type { TableCell, TableRow } from '@blood-bowl-tracker/review-harness';
import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import { RaceReviewConfigService } from '../config/review-race-config.service';
import { PositionExternalIdsService } from '../shared/position-external-ids.service';
import { RaceExternalIdsService } from '../shared/race-external-ids.service';
import { RacePositionsQueryService } from '../shared/race-positions-query.service';
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
 */
@Injectable()
export class PositionAvailabilityRawRendererService {
  constructor(
    private readonly query: RacePositionsQueryService,
    private readonly positionIds: PositionExternalIdsService,
    private readonly raceIds: RaceExternalIdsService,
    private readonly bbl: BblRawPositionPageService,
    private readonly tp: TpRawRosterIndexService,
    private readonly manual: ManualRawDataService,
    private readonly config: RaceReviewConfigService,
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
    const typIds = await this.bblTypIds(race.raceId);
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

  /**
   * Stored position name -> BBL typID, from each position's
   * `"<typId>-<raceBblId>"` external id. Split on the first `-` only: the
   * race half is what follows, and neither half is guaranteed hyphen-free.
   */
  private async bblTypIds(raceId: number): Promise<Map<string, string>> {
    const bblSystem = this.config.getExternalSystemName('bbl');
    const positions = await this.query.positionsFor(raceId);
    const byPosition = await this.positionIds.forPositions(
      positions.map((position) => position.positionId),
    );
    const typIds = new Map<string, string>();
    for (const position of positions) {
      const external = (byPosition.get(position.positionId) ?? []).find(
        (row) => row.systemName === bblSystem,
      );
      if (external === undefined || !external.externalId.includes('-')) {
        continue;
      }
      const typId = external.externalId.split('-')[0];
      if (typId !== undefined && typId !== '') {
        typIds.set(position.positionName, typId);
      }
    }
    return typIds;
  }

  private async tpSection(race: SampledRace): Promise<string | null> {
    const ids = await this.raceIds.forRace(race.raceId);
    const rows: TableCell[][] = [];
    const seen = new Set<number>();
    for (const code of ids.tp) {
      const tpRace = await this.tp.raceFor(code);
      for (const position of tpRace?.positions ?? []) {
        if (seen.has(position.tpPositionId)) {
          continue;
        }
        seen.add(position.tpPositionId);
        rows.push([
          code,
          String(position.tpPositionId),
          position.name,
          position.isStar ? 'star' : 'regular',
        ]);
      }
    }
    if (rows.length === 0) {
      return null;
    }
    return (
      this.html.subheading('TP') +
      this.html.table(
        ['teamRace code', 'TP position id', 'Position', 'Kind'],
        rows,
      )
    );
  }

  private async manualSection(race: SampledRace): Promise<string | null> {
    const owned = await this.raceIds.allForRace(race.raceId);
    const keys = new Set(
      owned.map((row) => `${row.systemName} ${row.externalId}`),
    );
    const rows: TableCell[][] = [];
    for (const entry of await this.manual.availability()) {
      for (const pair of entry.raceEras) {
        if (keys.has(`${pair.race.system} ${pair.race.id}`)) {
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
