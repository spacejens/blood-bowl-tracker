import type { TableCell } from '@blood-bowl-tracker/review-harness';
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

const NONE = '—';
const NAME_SYSTEM = 'Name';

/**
 * The position-characteristics raw panel: each source's own view of one
 * position's MA/ST/AG/PA/AV, on its own terms. BBL and TP each publish plain
 * numbers per position; the curated `position-characteristics.json5` answers
 * for the rules sets neither source evidences numerically the same way the
 * database stores them.
 *
 * Structured exactly like `PositionAvailabilityRawRendererService`: three
 * private `*Section(race)` methods returning `string | null`, joined by
 * `render`.
 */
@Injectable()
export class PositionCharacteristicsRawRendererService {
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
        `No raw position-characteristics data for race "${race.raceName}".`,
      );
    }
    return sections.join('\n');
  }

  private async bblSection(race: SampledRace): Promise<string | null> {
    const typIds = await this.bblTypIds(race.raceId);
    if (typIds.size === 0) {
      return null;
    }
    const rows: TableCell[][] = [];
    for (const [positionName, typId] of typIds) {
      const page = await this.bbl.positionFor(typId);
      if (page === null) {
        rows.push([positionName, typId, 'page not in the mirror']);
        continue;
      }
      if (page.characteristics === null) {
        rows.push([
          positionName,
          typId,
          'no characteristics table on the page',
        ]);
        continue;
      }
      const { move, strength, agility, passing, armour } = page.characteristics;
      rows.push([
        positionName,
        String(move),
        String(strength),
        String(agility),
        passing === null ? NONE : String(passing),
        String(armour),
      ]);
    }
    return (
      this.html.subheading('BBL') +
      this.html.table(['Position', 'MA', 'ST', 'AG', 'PA', 'AV'], rows)
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
        const { move, strength, agility, passing, armour } =
          position.characteristics;
        rows.push([
          position.name,
          String(move),
          String(strength),
          String(agility),
          String(passing),
          String(armour),
        ]);
      }
    }
    if (rows.length === 0) {
      return null;
    }
    return (
      this.html.subheading('TP') +
      this.html.table(['Position', 'MA', 'ST', 'AG', 'PA', 'AV'], rows)
    );
  }

  private async manualSection(race: SampledRace): Promise<string | null> {
    const positions = await this.query.positionsFor(race.raceId);
    const byPosition = await this.positionIds.forPositions(
      positions.map((position) => position.positionId),
    );
    const nameById = new Map<string, string>();
    for (const position of positions) {
      for (const row of byPosition.get(position.positionId) ?? []) {
        if (row.systemName === NAME_SYSTEM) {
          nameById.set(row.externalId, position.positionName);
        }
      }
    }
    const rows: TableCell[][] = [];
    for (const entry of await this.manual.characteristics()) {
      const positionName =
        entry.position.system === NAME_SYSTEM
          ? nameById.get(entry.position.id)
          : undefined;
      if (positionName === undefined) {
        continue;
      }
      rows.push([
        positionName,
        entry.rulesSet.id,
        entry.move === null ? NONE : String(entry.move),
        entry.strength === null ? NONE : String(entry.strength),
        entry.agility === null ? NONE : String(entry.agility),
        entry.passing === null ? NONE : String(entry.passing),
        entry.armour === null ? NONE : String(entry.armour),
      ]);
    }
    if (rows.length === 0) {
      return null;
    }
    return (
      this.html.subheading('Manual curation') +
      this.html.table(
        ['Position', 'Rules set', 'MA', 'ST', 'AG', 'PA', 'AV'],
        rows,
      )
    );
  }
}
