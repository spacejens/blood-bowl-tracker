import type { Db } from '@blood-bowl-tracker/db';
import {
  coaches,
  DB,
  matchEvents,
  matchTeams,
  players,
  positions,
  races,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

/** The team a killer belongs to, with the race and coach shown alongside it. */
export interface PlayerKillerTeam {
  teamId: number;
  teamName: string;
  raceId: number;
  raceName: string;
  coachId: number;
  coachName: string;
}

/**
 * Who was responsible for a player's death, at the best precision the imported
 * data supports:
 * - `player` — a specific, indexed player did it.
 * - `team` — the side is known but the individual is not (the source named a
 *   journeyman, mercenary, ... instead of linking a player row), or the event
 *   named no acting side at all and the match had exactly one other team.
 * - `ambiguousTeams` — no acting side was recorded and the match had more than
 *   one other team (a merged multi-team final), so every one of them is a
 *   candidate.
 * - `unknown` — a defensive fallback: a death event with no attributable acting
 *   side and no other team in the match to infer from. Not expected from any
 *   known importer behaviour.
 */
export type PlayerKillerInfo =
  | (PlayerKillerTeam & {
      kind: 'player';
      playerId: number;
      playerName: string;
      positionName: string;
    })
  | (PlayerKillerTeam & { kind: 'team' })
  | { kind: 'ambiguousTeams'; teams: PlayerKillerTeam[] }
  | { kind: 'unknown' };

/** One `match_teams` row of the death's match, resolved to display names. */
type MatchSide = PlayerKillerTeam & { matchTeamId: number };

/**
 * Answers "who killed this player?" for the player deepdive. Its own service
 * rather than another method on `PlayersService`, which is already close to the
 * repo's 500-line source ceiling.
 */
@Injectable()
export class PlayerDeathService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * `null` when the player never suffered a `death` consequence. At most one
   * such event is expected — a player who dies is dead (see
   * `docs/insights/match-event-counts.md`) — so the first row wins if the data
   * somehow holds more.
   */
  async getKillerInfo(playerId: number): Promise<PlayerKillerInfo | null> {
    const events = await this.db
      .select({
        matchId: matchEvents.matchId,
        actingPlayerId: matchEvents.actingPlayerId,
        actingMatchTeamId: matchEvents.actingMatchTeamId,
        consequenceMatchTeamId: matchEvents.consequenceMatchTeamId,
      })
      .from(matchEvents)
      .where(
        and(
          eq(matchEvents.consequencePlayerId, playerId),
          eq(matchEvents.consequenceType, 'death'),
        ),
      )
      .limit(1);
    const event = events[0];
    if (event === undefined) {
      return null;
    }

    const sides = await this.findMatchSides(event.matchId);
    // One selection rule covers both branches of the design: an explicitly
    // recorded acting side narrows to exactly that row, and an unrecorded one
    // leaves every side except the victim's own as a candidate.
    const candidates =
      event.actingMatchTeamId === null
        ? sides.filter(
            (side) => side.matchTeamId !== event.consequenceMatchTeamId,
          )
        : sides.filter((side) => side.matchTeamId === event.actingMatchTeamId);

    if (candidates.length === 0) {
      return { kind: 'unknown' };
    }
    if (candidates.length > 1) {
      return {
        kind: 'ambiguousTeams',
        teams: candidates.map((side) => this.toKillerTeam(side)),
      };
    }

    const team = this.toKillerTeam(candidates[0]);
    if (event.actingPlayerId === null) {
      return { kind: 'team', ...team };
    }
    const killer = await this.findKiller(event.actingPlayerId);
    if (killer === undefined) {
      return { kind: 'team', ...team };
    }
    return {
      kind: 'player',
      playerId: event.actingPlayerId,
      playerName: killer.playerName,
      positionName: killer.positionName,
      ...team,
    };
  }

  /**
   * Every side of the match, resolved to team/race/coach display names. All
   * four joins are on NOT NULL foreign keys, so no side can be dropped. Ordered
   * by team name so a multi-team match renders its candidates in a stable
   * order.
   */
  private findMatchSides(matchId: number): Promise<MatchSide[]> {
    return this.db
      .select({
        matchTeamId: matchTeams.id,
        teamId: teams.id,
        teamName: teams.name,
        raceId: races.id,
        raceName: races.name,
        coachId: coaches.id,
        coachName: coaches.name,
      })
      .from(matchTeams)
      .innerJoin(teamEras, eq(teamEras.id, matchTeams.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .innerJoin(races, eq(races.id, teams.raceId))
      .innerJoin(coaches, eq(coaches.id, teams.coachId))
      .where(eq(matchTeams.matchId, matchId))
      .orderBy(teams.name);
  }

  /** The killer's own name and position. */
  private async findKiller(
    killerPlayerId: number,
  ): Promise<{ playerName: string; positionName: string } | undefined> {
    const rows = await this.db
      .select({ playerName: players.name, positionName: positions.name })
      .from(players)
      .innerJoin(positions, eq(positions.id, players.positionId))
      .where(eq(players.id, killerPlayerId));
    return rows[0];
  }

  /** Drop the internal `matchTeamId` before the row leaves this service. */
  private toKillerTeam(side: MatchSide): PlayerKillerTeam {
    const { matchTeamId: _matchTeamId, ...team } = side;
    return team;
  }
}
