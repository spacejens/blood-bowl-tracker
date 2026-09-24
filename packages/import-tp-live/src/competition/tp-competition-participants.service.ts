import type { ImportError } from '@blood-bowl-tracker/api-contract';
import {
  CompetitionsService,
  TeamsService,
} from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import type { UpsertedTpCompetition } from './tp-competition-upsert.service';

/** Options for {@link TpCompetitionParticipantsService.linkParticipants}. */
export interface LinkTpParticipantsOptions {
  competition: UpsertedTpCompetition;
  /** TP roster ids of every team registered to the competition. */
  participantRosterIds: number[];
  errors: ImportError[];
}

@Injectable()
export class TpCompetitionParticipantsService {
  constructor(
    private readonly teams: TeamsService,
    private readonly competitions: CompetitionsService,
    private readonly importResults: TpImportResultsService,
    private readonly runner: TpUpsertRunnerService,
  ) {}

  /**
   * Resolves each registered roster to its team era in the competition's
   * era, then links every resolved team era to the competition
   * (`competition_teams`). This is the same add-only sync a match import's
   * participation step uses, so re-importing is harmless and a team a match
   * already linked stays linked. A roster whose team is not imported, or has
   * no team era in the competition's era, records one error and is skipped.
   * The rest are still linked. Resolves each linked roster id to its team
   * era id, or undefined when the link write itself failed (one error
   * recorded).
   */
  async linkParticipants({
    competition,
    participantRosterIds,
    errors,
  }: LinkTpParticipantsOptions): Promise<Map<number, number> | undefined> {
    const teamEraIdsByRosterId = new Map<number, number>();
    const rosterIds = [...new Set(participantRosterIds)];
    if (rosterIds.length === 0) {
      return teamEraIdsByRosterId;
    }
    const refs = await this.teams.resolveBatch(
      rosterIds.map((rosterId) => ({
        externalSystemId: competition.tpSystemId,
        externalId: String(rosterId),
      })),
    );
    for (const [index, rosterId] of rosterIds.entries()) {
      const ref = refs[index];
      const teamEraId = ref.found
        ? await this.teams.findTeamEraId(ref.id, competition.eraId)
        : undefined;
      if (teamEraId === undefined) {
        errors.push(
          this.importResults.error({
            item: {
              competition: competition.competitionTpId,
              roster: rosterId,
            },
            message: `Skipping roster ${rosterId} in competition ${competition.competitionTpId}: its team is not imported, or has no team era in the competition's era.`,
          }),
        );
        continue;
      }
      teamEraIdsByRosterId.set(rosterId, teamEraId);
    }
    if (teamEraIdsByRosterId.size === 0) {
      return teamEraIdsByRosterId;
    }

    const teamEraIds = [...teamEraIdsByRosterId.values()];
    const linked = await this.runner.record({
      run: () =>
        this.competitions.upsert({
          externalIds: [
            {
              externalSystemId: competition.tpSystemId,
              externalId: String(competition.competitionTpId),
            },
          ],
          teamEraIds,
        }),
      item: { competition: competition.competitionTpId, teamEraIds },
      errors,
      buildErrorMessage: (error) =>
        `Failed to add the registered teams to competition ${competition.competitionTpId}: ${this.runner.messageOf(error)}`,
    });
    return linked === undefined ? undefined : teamEraIdsByRosterId;
  }
}
