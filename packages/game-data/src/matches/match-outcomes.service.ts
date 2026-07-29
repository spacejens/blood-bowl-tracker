import type {
  MatchOutcomeHint,
  ResolveMatchOutcomes,
  ResolveMatchOutcomesResult,
} from '@blood-bowl-tracker/api-contract';
import type { Db } from '@blood-bowl-tracker/db';
import { DB, matches, matchEvents, matchTeams } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, isNotNull } from 'drizzle-orm';

import type {
  OutcomeMatch,
  ResolvedOutcome,
} from './match-outcome-resolver.service';
import { MatchOutcomeResolverService } from './match-outcome-resolver.service';

/**
 * Recomputes one competition's match scores and winners from data already in
 * the database, plus the caller's source-specific hints. Runs as an
 * importer's last step: scores come from counting `touchdown` match events
 * per `match_teams` row, and winners come from `MatchOutcomeResolverService`.
 *
 * Writes are minimal by design: a row is only updated when its value actually
 * changes, so re-running an import does not churn the history tables.
 *
 * A match the resolver cannot decide is left completely untouched and comes
 * back in `unresolvedMatchIds` — writing NULL there would read as a draw,
 * which is exactly the guess this feature refuses to make.
 */
@Injectable()
export class MatchOutcomesService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly resolver: MatchOutcomeResolverService,
  ) {}

  async resolveForCompetition(
    data: ResolveMatchOutcomes,
  ): Promise<ResolveMatchOutcomesResult> {
    const { competitionId } = data;

    const matchRows = await this.db
      .select({
        id: matches.id,
        category: matches.category,
        winningMatchTeamId: matches.winningMatchTeamId,
      })
      .from(matches)
      .where(eq(matches.competitionId, competitionId));

    const teamRows = await this.db
      .select({
        id: matchTeams.id,
        matchId: matchTeams.matchId,
        teamEraId: matchTeams.teamEraId,
        score: matchTeams.score,
      })
      .from(matchTeams)
      .innerJoin(matches, eq(matches.id, matchTeams.matchId))
      .where(eq(matches.competitionId, competitionId));

    const touchdownRows = await this.db
      .select({
        matchTeamId: matchEvents.actingMatchTeamId,
        touchdowns: count(),
      })
      .from(matchEvents)
      .innerJoin(matches, eq(matches.id, matchEvents.matchId))
      .where(
        and(
          eq(matches.competitionId, competitionId),
          eq(matchEvents.actionType, 'touchdown'),
          isNotNull(matchEvents.actingMatchTeamId),
        ),
      )
      .groupBy(matchEvents.actingMatchTeamId);

    const touchdownsByMatchTeamId = new Map<number, number>(
      touchdownRows
        .filter(
          (row): row is { matchTeamId: number; touchdowns: number } =>
            row.matchTeamId !== null,
        )
        .map((row) => [row.matchTeamId, row.touchdowns]),
    );

    const outcomeMatches: OutcomeMatch[] = matchRows.map((row) => ({
      matchId: row.id,
      category: row.category,
      teams: teamRows
        .filter((team) => team.matchId === row.id)
        .map((team) => ({
          matchTeamId: team.id,
          teamEraId: team.teamEraId,
          score: touchdownsByMatchTeamId.get(team.id) ?? 0,
        })),
    }));

    const { resolved, unresolvedMatchIds } = this.resolver.resolve({
      matches: outcomeMatches,
      overrides: MatchOutcomesService.toHintMap(data.overrides),
      tieBreaks: MatchOutcomesService.toHintMap(data.tieBreaks),
    });

    await this.writeScores(teamRows, touchdownsByMatchTeamId);
    await this.writeWinners(resolved, matchRows);

    return {
      competitionId,
      resolvedMatchIds: resolved.map((outcome) => outcome.matchId),
      unresolvedMatchIds,
    };
  }

  /**
   * A hint whose `winnerTeamEraId` is null still has to be present in the
   * map: `has(matchId)` is what distinguishes "the source says draw" from
   * "the source said nothing".
   */
  private static toHintMap(
    hints: MatchOutcomeHint[],
  ): Map<number, number | null> {
    return new Map(
      hints.map((hint) => [hint.matchId, hint.winnerTeamEraId] as const),
    );
  }

  private async writeScores(
    teamRows: { id: number; score: number }[],
    touchdownsByMatchTeamId: Map<number, number>,
  ): Promise<void> {
    for (const team of teamRows) {
      const score = touchdownsByMatchTeamId.get(team.id) ?? 0;
      if (score === team.score) {
        continue;
      }
      await this.db
        .update(matchTeams)
        .set({ score })
        .where(eq(matchTeams.id, team.id));
    }
  }

  private async writeWinners(
    resolved: ResolvedOutcome[],
    matchRows: { id: number; winningMatchTeamId: number | null }[],
  ): Promise<void> {
    for (const outcome of resolved) {
      const current = matchRows.find((row) => row.id === outcome.matchId);
      if (current?.winningMatchTeamId === outcome.winningMatchTeamId) {
        continue;
      }
      await this.db
        .update(matches)
        .set({ winningMatchTeamId: outcome.winningMatchTeamId })
        .where(eq(matches.id, outcome.matchId));
    }
  }
}
