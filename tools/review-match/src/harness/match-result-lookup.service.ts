import type { Db } from '@blood-bowl-tracker/db';
import {
  DB,
  matches,
  matchTeams,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';

interface MatchResultTeam {
  matchTeamId: number;
  teamName: string;
  score: number;
}

export interface MatchResultSummary {
  teams: MatchResultTeam[];
  /** `null` means the match was a draw. */
  winningMatchTeamId: number | null;
}

/**
 * Loads each sampled match's per-team scores and its winner, so the report
 * can show what the import decided the result was — the check this data most
 * needs, since a wrong score or winner is invisible in the event panels.
 */
@Injectable()
export class MatchResultLookupService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async findByMatchIds(
    matchIds: number[],
  ): Promise<Map<number, MatchResultSummary>> {
    if (matchIds.length === 0) {
      return new Map();
    }
    const rows = await this.db
      .select({
        matchId: matchTeams.matchId,
        matchTeamId: matchTeams.id,
        teamName: teams.name,
        score: matchTeams.score,
        winningMatchTeamId: matches.winningMatchTeamId,
      })
      .from(matchTeams)
      .innerJoin(matches, eq(matches.id, matchTeams.matchId))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .where(inArray(matchTeams.matchId, matchIds));

    const byMatchId = new Map<number, MatchResultSummary>();
    for (const row of rows) {
      const summary = byMatchId.get(row.matchId) ?? {
        teams: [],
        winningMatchTeamId: row.winningMatchTeamId,
      };
      summary.teams.push({
        matchTeamId: row.matchTeamId,
        teamName: row.teamName,
        score: row.score,
      });
      byMatchId.set(row.matchId, summary);
    }
    return byMatchId;
  }
}
