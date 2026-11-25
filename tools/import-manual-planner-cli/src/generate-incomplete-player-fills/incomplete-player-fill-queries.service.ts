import { DB, type Db, type DbOrTx } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { CandidateMatchQueriesService } from './candidate-match-queries.service';
import { CandidateQueriesService } from './candidate-queries.service';
import { EraRulesQueriesService } from './era-rules-queries.service';
import type {
  FillPlannerRows,
  LastingInjuryRepairCandidate,
  OngoingCompetitionSummary,
} from './fill-plan.types';
import type { OngoingCompetitionRow } from './fill-query.types';
import { FillQueryScopeService } from './fill-query-scope.service';
import { LastingInjuryRepairQueriesService } from './lasting-injury-repair-queries.service';
import { LookupQueriesService } from './lookup-queries.service';
import { PositionRulesQueriesService } from './position-rules-queries.service';

/** One consistent, read-only view of the database for a whole read. */
const READ_ONLY_SNAPSHOT = {
  isolationLevel: 'repeatable read',
  accessMode: 'read only',
} as const;

/**
 * Reads what the fill planner needs from the local database (a restored
 * production backup) in one read-only REPEATABLE READ transaction, so every
 * query sees the same snapshot. The rows cover the candidates and their
 * stored data, team players (TP players of the candidates' teams), their
 * paid advancements and rosters, skill names and categories, position
 * access, advancement costs and stat-reduction events, the competitions and
 * death times that decide whether they last, Big Guy positions, the TP ids
 * of skills and candidate positions, and the skills held with a variant.
 * The complete players who may need a lasting-reduction repair are read
 * separately, in a second such transaction.
 */
@Injectable()
export class IncompletePlayerFillQueriesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly scope: FillQueryScopeService,
    private readonly candidateQueries: CandidateQueriesService,
    private readonly matchQueries: CandidateMatchQueriesService,
    private readonly positionRules: PositionRulesQueriesService,
    private readonly eraRules: EraRulesQueriesService,
    private readonly lookups: LookupQueriesService,
    private readonly repairs: LastingInjuryRepairQueriesService,
  ) {}

  load(): Promise<FillPlannerRows> {
    return this.db.transaction((tx) => this.read(tx), READ_ONLY_SNAPSHOT);
  }

  /**
   * The complete TP players who may need a lasting-reduction repair, with
   * what the server derives their reductions from.
   */
  loadLastingInjuryRepairCandidates(): Promise<LastingInjuryRepairCandidate[]> {
    return this.db.transaction(
      (tx) => this.repairs.candidates(tx),
      READ_ONLY_SNAPSHOT,
    );
  }

  private async read(tx: DbOrTx): Promise<FillPlannerRows> {
    const ongoing = await this.lookups.ongoingCompetitions(tx);
    const candidates = this.scope.candidateScope(
      await this.candidateQueries.candidates(tx),
    );
    const teamPlayers = await this.candidateQueries.teamPlayers(
      tx,
      candidates.teamIds,
    );
    const team = this.scope.teamPlayerScope(teamPlayers);
    const consequences = await this.matchQueries.consequences(
      tx,
      candidates.playerIds,
    );
    const statReductionPlayerIds = consequences
      .filter((row) => row.hasStatReduction)
      .map((row) => row.playerId);
    const reduced = new Set(statReductionPlayerIds);
    return {
      candidates: candidates.rows,
      statReductionPlayerIds,
      deathPlayerIds: consequences
        .filter((row) => row.hasDeath)
        .map((row) => row.playerId),
      deathTimes: await this.matchQueries.deathTimes(tx, candidates.playerIds),
      storedAdvancements: await this.candidateQueries.storedAdvancements(
        tx,
        candidates.playerIds,
      ),
      freeSkillRiskPlayerIds:
        await this.candidateQueries.freeSkillRiskPlayerIds(
          tx,
          candidates.playerIds,
        ),
      ongoingTeamIds: [...new Set(ongoing.map((row) => row.teamId))],
      ongoingCompetitions: this.summarizeOngoing(ongoing),
      positionRulesSets: await this.positionRules.positionRulesSets(
        tx,
        candidates.positionEras,
      ),
      positionSkills: await this.positionRules.positionSkills(
        tx,
        candidates.positionEras,
      ),
      eraRulesSets: await this.eraRules.eraRulesSets(tx, team.eraIds),
      teamPlayers,
      teamRosters: await this.lookups.teamRosters(tx, candidates.teamIds),
      paidAdvancements: await this.candidateQueries.paidAdvancements(tx, {
        teamIds: candidates.teamIds,
        playerIds: team.playerIds,
      }),
      skillNames: await this.lookups.skillNames(tx),
      skillCategories: await this.eraRules.skillCategories(tx, team.eraIds),
      positionAccess: await this.positionRules.positionAccess(
        tx,
        team.positionEras,
      ),
      advancementCosts: await this.eraRules.advancementCosts(tx, team.eraIds),
      statReductionEvents: await this.matchQueries.statReductionEvents(
        tx,
        candidates.playerIds,
      ),
      teamCompetitions: await this.matchQueries.teamCompetitions(
        tx,
        candidates.playerTeamEras.filter((player) =>
          reduced.has(player.playerId),
        ),
      ),
      bigGuyPositions: await this.positionRules.bigGuyPositions(
        tx,
        candidates.positionEras,
      ),
      tpSkillIds: await this.lookups.tpSkillIds(tx),
      tpPositionIds: await this.lookups.tpPositionIds(
        tx,
        candidates.positionIds,
      ),
      attributedSkillIds: await this.lookups.attributedSkillIds(tx),
    };
  }

  /**
   * One summary per ongoing competition, counting its distinct teams (the
   * rows are distinct per competition and team), ordered by name and then id
   * so same-named competitions stay apart.
   */
  private summarizeOngoing(
    rows: readonly OngoingCompetitionRow[],
  ): OngoingCompetitionSummary[] {
    const byId = new Map<number, OngoingCompetitionSummary>();
    for (const row of rows) {
      const summary = byId.get(row.competitionId) ?? {
        competitionId: row.competitionId,
        name: row.competitionName,
        teamCount: 0,
      };
      summary.teamCount += 1;
      byId.set(row.competitionId, summary);
    }
    return [...byId.values()].sort(
      (a, b) =>
        a.name.localeCompare(b.name) || a.competitionId - b.competitionId,
    );
  }
}
