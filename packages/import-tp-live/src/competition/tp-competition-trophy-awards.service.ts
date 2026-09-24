import type { ImportError } from '@blood-bowl-tracker/api-contract';
import {
  CompetitionGroupsService,
  TrophiesService,
  TrophyAwardsService,
} from '@blood-bowl-tracker/game-data';
import type { TpAward } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import type { UpsertedTpCompetition } from './tp-competition-upsert.service';

/** Options for {@link TpCompetitionTrophyAwardsService.importAwards}. */
export interface ImportTpTrophyAwardsOptions {
  competition: UpsertedTpCompetition;
  /** The competition's parsed awards; empty for one with none yet. */
  awards: TpAward[];
  /** Each linked participant's team era id, by TP roster id. */
  teamEraIdsByRosterId: ReadonlyMap<number, number>;
  errors: ImportError[];
}

/** What every award row of one import shares. */
interface AwardContext {
  competition: UpsertedTpCompetition;
  groupName: string;
  teamEraIdsByRosterId: ReadonlyMap<number, number>;
  /** Each trophy key already looked up, failures included (undefined). */
  trophyIdsByKey: Map<string, number | undefined>;
  /** Per already-unresolvable key, how many further rows were dropped. */
  droppedRowCountsByKey: Map<string, number>;
  errors: ImportError[];
}

@Injectable()
export class TpCompetitionTrophyAwardsService {
  constructor(
    private readonly competitionGroups: CompetitionGroupsService,
    private readonly trophies: TrophiesService,
    private readonly trophyAwards: TrophyAwardsService,
    private readonly importResults: TpImportResultsService,
    private readonly runner: TpUpsertRunnerService,
  ) {}

  /**
   * Records the competition's awards as team awards (`playerId: null`): TP
   * records no individual player awards. A trophy is resolved, never
   * created. The lookup key is `${disambiguator}-${groupName}`, because TP's
   * raw `awardType` codes are not globally unique: the same code means a
   * different trophy in a different competition group. The disambiguator is
   * the award's own `name` where it has one (Best Stunty and Wooden Spoon
   * share a numeric code), else the numeric code. The group name comes from
   * the competition's own curated group. An award whose roster is not a
   * linked participant is skipped with an error. An unresolvable key is
   * reported once, and its further rows are summarized in one error at the
   * end. Resolves the number of award rows written.
   */
  async importAwards({
    competition,
    awards,
    teamEraIdsByRosterId,
    errors,
  }: ImportTpTrophyAwardsOptions): Promise<number> {
    if (awards.length === 0) {
      return 0;
    }
    const groups = await this.competitionGroups.listAllForApi();
    const groupName = groups.find(
      (group) => group.id === competition.competitionGroupId,
    )?.name;
    if (groupName === undefined) {
      errors.push(
        this.importResults.error({
          item: { competition: competition.competitionTpId },
          message: `Skipping trophy awards for competition ${competition.competitionTpId}: its competition group ${competition.competitionGroupId} is not in the curated competition-group catalog.`,
        }),
      );
      return 0;
    }
    const context: AwardContext = {
      competition,
      groupName,
      teamEraIdsByRosterId,
      trophyIdsByKey: new Map(),
      droppedRowCountsByKey: new Map(),
      errors,
    };
    let imported = 0;
    for (const award of awards) {
      if (await this.writeAward(award, context)) {
        imported += 1;
      }
    }
    for (const [key, droppedCount] of context.droppedRowCountsByKey) {
      errors.push(
        this.importResults.error({
          item: { trophy: key },
          message: `Skipped ${droppedCount} further award row(s) referencing the "${key}" trophy key: it could not be resolved (see the earlier error for this key).`,
        }),
      );
    }
    return imported;
  }

  /** Writes one award row when its team era and trophy resolve. */
  private async writeAward(
    award: TpAward,
    context: AwardContext,
  ): Promise<boolean> {
    const { competition, errors } = context;
    // `||`, not `??`: an empty name must fall back to the numeric code too.
    const key = `${award.name || award.awardType}-${context.groupName}`;
    const teamEraId = context.teamEraIdsByRosterId.get(award.rosterId);
    if (teamEraId === undefined) {
      errors.push(
        this.importResults.error({
          item: { competition: competition.competitionTpId, trophy: key },
          message: `Skipping the "${key}" award in competition ${competition.competitionTpId}: roster ${award.rosterId} is not a linked participant of the competition.`,
        }),
      );
      return false;
    }
    const trophyId = await this.resolveTrophyId(key, context);
    if (trophyId === undefined) {
      return false;
    }
    const awarded = await this.runner.record({
      run: () =>
        this.trophyAwards.upsert({
          trophyId,
          competitionId: competition.competitionId,
          teamEraId,
          playerId: null,
        }),
      item: {
        competition: competition.competitionTpId,
        trophy: key,
        roster: award.rosterId,
      },
      errors,
      buildErrorMessage: (error) =>
        `Failed to record the "${key}" award in competition ${competition.competitionTpId}: ${this.runner.messageOf(error)}`,
    });
    return awarded !== undefined;
  }

  /**
   * The curated trophy with this TP external id, memoized per import,
   * failures included. The first miss for a key records an error; every
   * later row with that key is counted instead of reported.
   */
  private async resolveTrophyId(
    key: string,
    context: AwardContext,
  ): Promise<number | undefined> {
    if (context.trophyIdsByKey.has(key)) {
      const known = context.trophyIdsByKey.get(key);
      if (known === undefined) {
        context.droppedRowCountsByKey.set(
          key,
          (context.droppedRowCountsByKey.get(key) ?? 0) + 1,
        );
      }
      return known;
    }
    const { competition } = context;
    const ref = await this.trophies.resolve({
      externalSystemId: competition.tpSystemId,
      externalId: key,
    });
    const trophyId = ref.found ? ref.id : undefined;
    if (trophyId === undefined) {
      context.errors.push(
        this.importResults.error({
          item: { competition: competition.competitionTpId, trophy: key },
          message: `Skipping the "${key}" award in competition ${competition.competitionTpId}: no curated trophy has the TP external id "${key}".`,
        }),
      );
    }
    context.trophyIdsByKey.set(key, trophyId);
    return trophyId;
  }
}
