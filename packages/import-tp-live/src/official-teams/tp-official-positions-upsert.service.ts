import type {
  ExternalId,
  ImportError,
  PositionSkillCategories,
  TpOfficialCharacteristics,
  TpOfficialPosition,
  TpOfficialRace,
  TpOfficialSkillRef,
} from '@blood-bowl-tracker/api-contract';
import { PositionsService } from '@blood-bowl-tracker/game-data';
import {
  ImportResultService,
  NameExternalIdService,
  UpsertRecorderService,
} from '@blood-bowl-tracker/import-shared';
import { TpOfficialListingPrecedenceService } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import type { TpOfficialRaceRef } from './tp-official-races-upsert.service';
import type { TpOfficialTeamsContext } from './tp-official-teams-context.service';

/**
 * One upserted position under the rules set, with the characteristics,
 * starting skills and keyword codes the later steps write for it.
 */
export interface TpOfficialPositionSlot {
  positionId: number;
  name: string;
  characteristics: TpOfficialCharacteristics;
  skills: TpOfficialSkillRef[];
  keywordCodes: number[];
  skillCategories: PositionSkillCategories;
  /** Set when TP's categories for this position are corrupt; they must not be written. */
  skillCategoriesError?: string;
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
  characteristics: TpOfficialCharacteristics;
  skills: TpOfficialSkillRef[];
  keywordCodes: number[];
  skillCategories: PositionSkillCategories;
  skillCategoriesError?: string;
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
    private readonly nameExternalId: NameExternalIdService,
    private readonly importResults: ImportResultService,
    private readonly runner: UpsertRecorderService,
    private readonly precedence: TpOfficialListingPrecedenceService,
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
    const slotIsOfficial = new Map<number, boolean>();
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
      const {
        characteristics,
        skills,
        keywordCodes,
        skillCategories,
        skillCategoriesError,
      } = group.source;
      // A star fielded by several races is one group per race, all landing on
      // one row, so the row keeps a single slot, chosen by the same
      // precedence groupPositions applies within one race, since the races
      // can disagree on a star's stats.
      const slotOfficial = slotIsOfficial.get(positionId);
      if (
        slotOfficial === undefined ||
        this.precedence.replaces({
          current: { isOfficial: slotOfficial },
          candidate: group.source,
        })
      ) {
        slotsByPositionId.set(positionId, {
          positionId,
          name: group.name,
          characteristics,
          skills,
          keywordCodes,
          skillCategories,
          skillCategoriesError,
        });
        slotIsOfficial.set(positionId, group.source.isOfficial);
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
   * Adds one listing of a position to its group, created on first use. The
   * listing replaces the recorded one when TpOfficialListingPrecedenceService
   * says so: a legacy listing never replaces an official one, and any other
   * listing does, so an official value arriving after a legacy one still wins.
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
      skillCategories: position.skillCategories,
      skillCategoriesError: position.skillCategoriesError,
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
    } else if (
      this.precedence.replaces({ current: group.source, candidate: source })
    ) {
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
