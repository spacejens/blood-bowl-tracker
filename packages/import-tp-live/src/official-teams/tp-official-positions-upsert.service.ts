import type { ExternalId, ImportError } from '@blood-bowl-tracker/api-contract';
import { PositionsService } from '@blood-bowl-tracker/game-data';
import type {
  TpOfficialPosition,
  TpOfficialRace,
  TpPositionCharacteristics,
  TpPositionSkillRef,
} from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpNameExternalIdService } from '../tp-name-external-id.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import type { TpOfficialRaceRef } from './tp-official-races-upsert.service';
import type { TpOfficialTeamsContext } from './tp-official-teams-context.service';

/**
 * One upserted position under the rules set, with the characteristics,
 * starting skills and keyword codes the later steps write for it.
 */
export interface TpOfficialPositionSlot {
  positionId: number;
  name: string;
  characteristics: TpPositionCharacteristics;
  skills: TpPositionSkillRef[];
  keywordCodes: number[];
}

/** Options for {@link TpOfficialPositionsUpsertService.upsertPositions}. */
export interface UpsertOfficialPositionsOptions {
  races: TpOfficialRace[];
  /** From the races step: every imported race by its `teamRaceCode`. */
  racesByCode: Map<string, TpOfficialRaceRef>;
  context: TpOfficialTeamsContext;
  errors: ImportError[];
}

/** What upserting one rules set's positions did. */
export interface UpsertedOfficialPositions {
  imported: number;
  /** One per upserted position row. */
  slots: TpOfficialPositionSlot[];
}

/** One rules set's values for a position, tagged with the roster kind they came from. */
interface PositionSource {
  characteristics: TpPositionCharacteristics;
  skills: TpPositionSkillRef[];
  keywordCodes: number[];
  isOfficial: boolean;
}

/** One position, keyed by (race row, name), across every variant listing it. */
interface PositionGroup {
  race: TpOfficialRaceRef;
  name: string;
  isStarPlayer: boolean;
  tpPositionIds: Set<number>;
  source: PositionSource;
}

@Injectable()
export class TpOfficialPositionsUpsertService {
  constructor(
    private readonly positions: PositionsService,
    private readonly nameExternalId: TpNameExternalIdService,
    private readonly importResults: TpImportResultsService,
    private readonly runner: TpUpsertRunnerService,
  ) {}

  /**
   * Upserts every position on one rules set's official list, regular and
   * star alike (`isStarPlayer` is the only difference), grouped by
   * `(race row, position name)` so a position listed under several variant
   * codes of one race collapses onto one row collecting every TP position
   * id. A regular position's Name external id is race-scoped; a star's is
   * its bare name, which is what dedupes it onto the same row as the
   * inducement-hire path and the BBL importer's stars (a star colliding with
   * a regular position is rejected server-side by PositionsService).
   *
   * An official roster and a legacy one of the same race can carry the same
   * position with different characteristics; the official value wins
   * regardless of which is listed first, and a legacy-only position keeps
   * its legacy value.
   *
   * Every upserted position becomes available to its race in every TP era
   * declaring the rules set (the sync only ever adds rows). A race that was
   * not imported skips its positions with one error; a failed upsert or sync
   * records one error and never stops the other positions.
   */
  async upsertPositions(
    options: UpsertOfficialPositionsOptions,
  ): Promise<UpsertedOfficialPositions> {
    const { context, errors } = options;
    let imported = 0;
    const slotsByPositionId = new Map<number, TpOfficialPositionSlot>();
    const officialSlotPositionIds = new Set<number>();
    for (const group of this.groupPositions(options).values()) {
      const upserted = await this.runner.record({
        run: () =>
          this.positions.upsert({
            name: group.name,
            isStarPlayer: group.isStarPlayer,
            externalIds: this.externalIdsFor(group, context),
          }),
        item: {
          position: group.name,
          race: group.race.raceName,
          rulesSet: context.rulesSet,
        },
        errors,
        buildErrorMessage: (error) =>
          `Failed to upsert position "${group.name}" (race "${group.race.raceName}", ${context.rulesSet}): ${this.runner.messageOf(error)}`,
      });
      if (upserted === undefined) {
        continue;
      }
      imported += 1;
      const positionId = upserted.position.id;
      const { characteristics, skills, keywordCodes } = group.source;
      // A star fielded by several races is one group per race, all landing on
      // one row, so the row keeps a single slot; an official listing's values
      // win over a legacy one's, the same precedence groupPositions applies
      // within one race, since the races can disagree on a star's stats.
      if (
        !slotsByPositionId.has(positionId) ||
        group.source.isOfficial ||
        !officialSlotPositionIds.has(positionId)
      ) {
        slotsByPositionId.set(positionId, {
          positionId,
          name: group.name,
          characteristics,
          skills,
          keywordCodes,
        });
        if (group.source.isOfficial) {
          officialSlotPositionIds.add(positionId);
        }
      }
      if (context.eraIds.length > 0) {
        await this.runner.record({
          run: () =>
            this.positions.syncRaceEras({
              positionId,
              raceEras: context.eraIds.map((eraId) => ({
                raceId: group.race.raceId,
                eraId,
              })),
            }),
          item: { positionId, raceId: group.race.raceId },
          errors,
          buildErrorMessage: (error) =>
            `Failed to sync the race eras of position "${group.name}" (race "${group.race.raceName}"): ${this.runner.messageOf(error)}`,
        });
      }
    }
    return { imported, slots: [...slotsByPositionId.values()] };
  }

  /** Every listed position grouped by (race row, name), official values winning. */
  private groupPositions({
    races,
    racesByCode,
    context,
    errors,
  }: UpsertOfficialPositionsOptions): Map<string, PositionGroup> {
    const groups = new Map<string, PositionGroup>();
    const skippedCodes = new Set<string>();
    for (const race of races) {
      const raceRef = racesByCode.get(race.teamRaceCode);
      if (raceRef === undefined) {
        if (!skippedCodes.has(race.teamRaceCode)) {
          skippedCodes.add(race.teamRaceCode);
          errors.push(
            this.importResults.error({
              item: {
                race: race.name,
                teamRaceCode: race.teamRaceCode,
                rulesSet: context.rulesSet,
              },
              message: `Skipping the positions of race "${race.name}" (${race.teamRaceCode}, ${context.rulesSet}): the race was not imported.`,
            }),
          );
        }
        continue;
      }
      for (const position of race.positions) {
        this.addToGroup({
          groups,
          raceRef,
          position,
          isOfficial: race.isOfficial,
        });
      }
    }
    return groups;
  }

  /**
   * Adds one listing of a position to its group, created on first use. A
   * legacy listing never replaces an official one already recorded; any
   * other listing replaces what is there, so an official value arriving
   * after a legacy one still wins.
   */
  private addToGroup(options: {
    groups: Map<string, PositionGroup>;
    raceRef: TpOfficialRaceRef;
    position: TpOfficialPosition;
    isOfficial: boolean;
  }): void {
    const { groups, raceRef, position, isOfficial } = options;
    const source: PositionSource = {
      characteristics: position.characteristics,
      skills: position.skills,
      keywordCodes: position.keywordCodes,
      isOfficial,
    };
    const key = `${raceRef.raceId} ${position.name}`;
    let group = groups.get(key);
    if (group === undefined) {
      group = {
        race: raceRef,
        name: position.name,
        isStarPlayer: position.isStarPlayer,
        tpPositionIds: new Set(),
        source,
      };
      groups.set(key, group);
    } else if (!group.source.isOfficial || isOfficial) {
      group.source = source;
    }
    if (position.tpPositionId !== undefined) {
      group.tpPositionIds.add(position.tpPositionId);
    }
  }

  /**
   * A group's external ids: one TP id per official-list position id (what
   * keeps a roster-embedded player resolvable, since players look their
   * position up by `String(lineUpMasterId)`), plus a Name id -- and, for a
   * star, its bare name as a TP id too, matching the inducement-hire path.
   */
  private externalIdsFor(
    group: PositionGroup,
    context: TpOfficialTeamsContext,
  ): ExternalId[] {
    const externalIds: ExternalId[] = [...group.tpPositionIds].map((id) => ({
      externalSystemId: context.tpSystemId,
      externalId: String(id),
    }));
    if (group.isStarPlayer) {
      externalIds.push(
        { externalSystemId: context.tpSystemId, externalId: group.name },
        {
          externalSystemId: context.nameSystemId,
          externalId: this.nameExternalId.forStarPosition(group.name),
        },
      );
      return externalIds;
    }
    externalIds.push({
      externalSystemId: context.nameSystemId,
      externalId: this.nameExternalId.forPosition(
        group.race.raceName,
        group.name,
      ),
    });
    return externalIds;
  }
}
