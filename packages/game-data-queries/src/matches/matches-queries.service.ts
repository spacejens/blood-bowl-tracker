import type { Db } from '@blood-bowl-tracker/db';
import {
  count,
  countDistinct,
  DB,
  eq,
  eras,
  matches,
  matchEvents,
  matchTeams,
  teamEras,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { countRows } from '../shared/count-all';

/**
 * Read-only match and match-event counts for the Discord bot's stats summary.
 * Match ingestion is `MatchesService` in packages/game-data.
 */
@Injectable()
export class MatchesQueriesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  countAll(): Promise<number> {
    return countRows(this.db, matches);
  }

  countMatchEvents(): Promise<number> {
    return countRows(this.db, matchEvents);
  }

  async countByEra(eraId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(matchTeams.matchId) })
      .from(matchTeams)
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .where(eq(teamEras.eraId, eraId));
    return row.count;
  }

  async countMatchEventsByEra(eraId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(matchEvents.id) })
      .from(matchEvents)
      .innerJoin(matchTeams, eq(matchTeams.matchId, matchEvents.matchId))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .where(eq(teamEras.eraId, eraId));
    return row.count;
  }

  async countByLeague(leagueId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(matchTeams.matchId) })
      .from(matchTeams)
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .where(eq(eras.leagueId, leagueId));
    return row.count;
  }

  async countMatchEventsByLeague(leagueId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(matchEvents.id) })
      .from(matchEvents)
      .innerJoin(matchTeams, eq(matchTeams.matchId, matchEvents.matchId))
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .where(eq(eras.leagueId, leagueId));
    return row.count;
  }

  async countByCompetition(competitionId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: count() })
      .from(matches)
      .where(eq(matches.competitionId, competitionId));
    return row.count;
  }

  async countMatchEventsByCompetition(competitionId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(matchEvents.id) })
      .from(matchEvents)
      .innerJoin(matches, eq(matches.id, matchEvents.matchId))
      .where(eq(matches.competitionId, competitionId));
    return row.count;
  }
}
