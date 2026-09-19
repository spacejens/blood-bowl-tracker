import type { TableCell, TableRow } from '@blood-bowl-tracker/review-harness';
import {
  HtmlService,
  SkillFormatService,
} from '@blood-bowl-tracker/review-harness';
import { Injectable } from '@nestjs/common';

import { BblPositionTypIdsService } from '../shared/bbl-position-typ-ids.service';
import { PositionExternalIdsService } from '../shared/position-external-ids.service';
import { RaceExternalIdsService } from '../shared/race-external-ids.service';
import { RacePositionsQueryService } from '../shared/race-positions-query.service';
import type { SampledRace } from '../shared/review.types';
import { BblRawPositionPageService } from '../source/bbl-raw-position-page.service';
import { ManualRawDataService } from '../source/manual-raw-data.service';
import type { TpRawOfficialPosition } from '../source/tp-raw-official-teams-index.service';
import { TpRawOfficialTeamsIndexService } from '../source/tp-raw-official-teams-index.service';
import { TpSkillMasterNamesService } from '../source/tp-skill-master-names.service';

/** What a cell shows for a position the source gives no starting skills. */
const NO_SKILLS = 'none';

const NAME_SYSTEM = 'Name';

/**
 * The starting-skills raw panel: each source's own view of which skills a
 * race's positions start with, on its own terms.
 *
 * BBL publishes one rules-set-less Skills cell per position page; TP names
 * skills by per-rules-set `skillMasterId` (resolved to a name via
 * `TpSkillMasterNamesService`, shown as `skill master #<id>` when no
 * downloaded roster file explains it); the curated `position-skills.json5`
 * answers for the rules sets neither source covers.
 *
 * No skill here ever carries the random or elite marker: both are
 * advancement-only concepts, and a starting skill never has them even where
 * TP flags the skill itself as elite. A star's own exclusive skill is marked
 * unique — but star players are excluded from this tool, so that only shows
 * up in `tools/review-star-player`.
 *
 * Structured exactly like `PositionCharacteristicsRawRendererService`: three
 * private `*Section(race)` methods returning `string | null`, joined by
 * `render`.
 */
@Injectable()
export class PositionStartingSkillsRawRendererService {
  constructor(
    private readonly query: RacePositionsQueryService,
    private readonly positionIds: PositionExternalIdsService,
    private readonly raceIds: RaceExternalIdsService,
    private readonly bbl: BblRawPositionPageService,
    private readonly tp: TpRawOfficialTeamsIndexService,
    private readonly manual: ManualRawDataService,
    private readonly typIds: BblPositionTypIdsService,
    private readonly masters: TpSkillMasterNamesService,
    private readonly skillFormat: SkillFormatService,
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
        `No raw starting-skill data for race "${race.raceName}".`,
      );
    }
    return sections.join('\n');
  }

  private async bblSection(race: SampledRace): Promise<string | null> {
    const typIds = await this.typIds.forRace(race.raceId);
    if (typIds.size === 0) {
      return null;
    }
    const rows: TableRow[] = [];
    // Cells 0-1 are the position name and BBL typID, so the skills cell is
    // cell 2, matching the headers below.
    for (const [positionName, typId] of typIds) {
      const page = await this.bbl.positionFor(typId);
      if (page === null) {
        rows.push(
          this.html.highlight(
            [positionName, typId, 'page not in the mirror'],
            [2],
          ),
        );
        continue;
      }
      const skills = page.skills.map((skill) =>
        this.skillFormat.format({
          name: skill.name,
          attributeValue: skill.attributeValue,
        }),
      );
      rows.push([positionName, typId, this.join(skills)]);
    }
    return (
      this.html.subheading('BBL') +
      this.html.table(['Position', 'BBL typID', 'Starting skills'], rows)
    );
  }

  /**
   * Star players are excluded — this tool reviews ordinary positions only.
   * Where a race's official and legacy rosters both carry the same (rules
   * set, position), the official one wins, exactly as the characteristics
   * panel resolves the same conflict.
   */
  private async tpSection(race: SampledRace): Promise<string | null> {
    const ids = await this.raceIds.forRace(race.raceId);
    const byKey = new Map<string, TpRawOfficialPosition>();
    for (const code of ids.tp) {
      const tpRace = await this.tp.raceFor(code);
      for (const position of tpRace?.positions ?? []) {
        if (position.isStar) {
          continue;
        }
        const key = `${position.rulesSet} ${position.name}`;
        const existing = byKey.get(key);
        if (
          existing === undefined ||
          (!existing.isOfficial && position.isOfficial)
        ) {
          byKey.set(key, position);
        }
      }
    }
    const rows: TableCell[][] = [];
    for (const position of byKey.values()) {
      rows.push([
        position.name,
        position.rulesSet,
        this.join(await this.tpSkills(position)),
      ]);
    }
    if (rows.length === 0) {
      return null;
    }
    return (
      this.html.subheading('TP') +
      this.html.table(['Position', 'Rules set', 'Starting skills'], rows)
    );
  }

  /** One TP entry's skills, each resolved to a name where possible. */
  private async tpSkills(position: TpRawOfficialPosition): Promise<string[]> {
    const skills: string[] = [];
    for (const ref of position.skills) {
      const master = await this.masters.masterFor(ref.skillMasterId);
      skills.push(
        this.skillFormat.format({
          name: master?.name ?? `skill master #${ref.skillMasterId}`,
          attributeValue: ref.attributeValue,
        }),
      );
    }
    return skills;
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
    for (const entry of await this.manual.positionSkills()) {
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
        this.join(
          entry.skills.map((skill) =>
            this.skillFormat.format({
              name: skill.skill.id,
              attributeValue: skill.attributeValue,
            }),
          ),
        ),
      ]);
    }
    if (rows.length === 0) {
      return null;
    }
    return (
      this.html.subheading('Manual curation') +
      this.html.table(['Position', 'Rules set', 'Starting skills'], rows)
    );
  }

  private join(skills: readonly string[]): string {
    return skills.length === 0 ? NO_SKILLS : skills.join(', ');
  }
}
