import type { Db } from '@blood-bowl-tracker/db';
import {
  coaches,
  DB,
  matches,
  matchEvents,
  matchTeams,
  players,
  positions,
  races,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq } from 'drizzle-orm';

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
 *
 * `viaFoul` is orthogonal to the killer's precision: it reports that the fatal
 * event was recorded as a foul (`actionType = 'foul'`) rather than a regular
 * blocking action, which Blood Bowl treats differently — no casualty credit is
 * awarded for a foul.
 */
export type PlayerKillerInfo = (
  | (PlayerKillerTeam & {
      kind: 'player';
      playerId: number;
      playerName: string;
      positionName: string;
    })
  | (PlayerKillerTeam & { kind: 'team' })
  | { kind: 'ambiguousTeams'; teams: PlayerKillerTeam[] }
  | { kind: 'unknown' }
) & { viaFoul: boolean };

/**
 * One kill this player inflicted, describing the *victim* side at the best
 * precision the data supports. Same shape as `PlayerKillerInfo` with the role
 * swapped: `player` names the victim, `team` knows only their side,
 * `ambiguousTeams` lists every side the victim could have belonged to in a
 * merged multi-team match, and `unknown` is the defensive fallback. `viaFoul`
 * reports that the fatal event was recorded as a foul. There is nothing
 * distinguishing the two types beyond intent — a `PlayerKillEntry` names a
 * victim where a `PlayerKillerInfo` names a killer — so this is a type alias
 * rather than a second, structurally identical declaration.
 */
export type PlayerKillEntry = PlayerKillerInfo;

/** One `match_events` row where this player caused a death. */
interface KillEvent {
  matchId: number;
  actionType: string | null;
  actingMatchTeamId: number | null;
  consequencePlayerId: number | null;
  consequenceMatchTeamId: number | null;
}

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
        actionType: matchEvents.actionType,
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
      .orderBy(matchEvents.id)
      .limit(1);
    const event = events[0];
    if (event === undefined) {
      return null;
    }

    const viaFoul = event.actionType === 'foul';

    const sides = await this.findMatchSides(event.matchId);

    // A named killer takes priority over any team-candidate ambiguity: the
    // data directly identifies who did it, regardless of whether the acting
    // side was also recorded, and regardless of how many other teams shared
    // the match. Resolve the killer's own team from their player row (rather
    // than from `actingMatchTeamId`, which can be null) and match it against
    // the sides already fetched above.
    if (event.actingPlayerId !== null) {
      const killer = await this.findPlayerSummary(event.actingPlayerId);
      const killerSide = sides.find((side) => side.teamId === killer?.teamId);
      if (killer !== undefined && killerSide !== undefined) {
        return {
          kind: 'player',
          playerId: event.actingPlayerId,
          playerName: killer.playerName,
          positionName: killer.positionName,
          ...this.toKillerTeam(killerSide),
          viaFoul,
        };
      }
      // Defensive fallback: the event names an acting player, but either no
      // such player row exists or their team could not be matched against
      // this match's sides. Not expected from any known importer behaviour —
      // fall through to the acting-team-based resolution below, same as an
      // event with no named killer at all.
    }

    // One selection rule covers both remaining branches of the design: an
    // explicitly recorded acting side narrows to exactly that row, and an
    // unrecorded one leaves every side except the victim's own as a
    // candidate.
    const candidates =
      event.actingMatchTeamId === null
        ? await this.candidatesExcludingVictim(
            playerId,
            sides,
            event.consequenceMatchTeamId,
          )
        : sides.filter((side) => side.matchTeamId === event.actingMatchTeamId);

    if (candidates.length === 0) {
      return { kind: 'unknown', viaFoul };
    }
    if (candidates.length > 1) {
      return {
        kind: 'ambiguousTeams',
        teams: candidates.map((side) => this.toKillerTeam(side)),
        viaFoul,
      };
    }

    return { kind: 'team', ...this.toKillerTeam(candidates[0]), viaFoul };
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

  /** One player's own name, position, and team id. */
  private async findPlayerSummary(playerId: number): Promise<
    | {
        playerName: string;
        positionName: string;
        teamId: number;
      }
    | undefined
  > {
    const rows = await this.db
      .select({
        playerName: players.name,
        positionName: positions.name,
        teamId: teams.id,
      })
      .from(players)
      .innerJoin(positions, eq(positions.id, players.positionId))
      .innerJoin(teamEras, eq(teamEras.id, players.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .where(eq(players.id, playerId));
    return rows[0];
  }

  /**
   * Every side except the victim's own, for the "no acting side recorded"
   * branch of `getKillerInfo`. Excludes the victim's side by
   * `consequenceMatchTeamId` when it was recorded, and — mirroring
   * `resolveKillEntry`'s symmetric fallback for the perpetrator's own side —
   * by resolving the victim's own team via their player row when it was not.
   * `playerId` is `getKillerInfo`'s own parameter, so it always names the
   * victim here. Without this second fallback, an event with neither side
   * recorded would leave every side a candidate, including the victim's own
   * team, which can never be its own killer.
   */
  private async candidatesExcludingVictim(
    playerId: number,
    sides: MatchSide[],
    consequenceMatchTeamId: number | null,
  ): Promise<MatchSide[]> {
    let victimMatchTeamId = consequenceMatchTeamId ?? undefined;
    if (victimMatchTeamId === undefined) {
      const victim = await this.findPlayerSummary(playerId);
      victimMatchTeamId = sides.find(
        (side) => side.teamId === victim?.teamId,
      )?.matchTeamId;
    }
    return sides.filter((side) => side.matchTeamId !== victimMatchTeamId);
  }

  /** Drop the internal `matchTeamId` before the row leaves this service. */
  private toKillerTeam(side: MatchSide): PlayerKillerTeam {
    const { matchTeamId: _matchTeamId, ...team } = side;
    return team;
  }

  /**
   * How many deaths this player has caused, foul-caused ones included: any
   * event where they were the actor and the consequence was a death. This is
   * the true total behind the deepdive's capped kills list, so its overflow
   * note can report an exact remainder.
   */
  async countKillsInflicted(playerId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: count(matchEvents.id) })
      .from(matchEvents)
      .where(
        and(
          eq(matchEvents.actingPlayerId, playerId),
          eq(matchEvents.consequenceType, 'death'),
        ),
      );
    return row.count;
  }

  /**
   * This player's kills, newest match first, capped at `limit`. One entry per
   * kill event — a victim killed twice appears twice, since each is its own
   * event. Match sides are fetched once per match, so a bloodbath in a single
   * match costs one lookup rather than one per kill.
   */
  async getKillsInflicted(
    playerId: number,
    limit: number,
  ): Promise<PlayerKillEntry[]> {
    const events = await this.findKillEvents(playerId, limit);
    if (events.length === 0) {
      return [];
    }
    // The perpetrator's own team, used to exclude their side from the
    // candidates when neither the victim's side nor the acting side was
    // recorded. Fetched once up front rather than lazily, so the query order
    // stays the same for every input.
    const killerTeamId = (await this.findPlayerSummary(playerId))?.teamId;

    const entries: PlayerKillEntry[] = [];
    const sidesByMatch = new Map<number, MatchSide[]>();
    for (const event of events) {
      let sides = sidesByMatch.get(event.matchId);
      if (sides === undefined) {
        sides = await this.findMatchSides(event.matchId);
        sidesByMatch.set(event.matchId, sides);
      }
      entries.push(await this.resolveKillEntry(event, { sides, killerTeamId }));
    }
    return entries;
  }

  /**
   * The capped, newest-first kill events, joined to `matches` for ordering.
   * Ordered secondarily by `matchEvents.id`, matching `getKillerInfo`'s
   * convention, so multiple kills within the same match (a bloodbath) come
   * back in a stable order rather than an arbitrary one.
   */
  private findKillEvents(
    playerId: number,
    limit: number,
  ): Promise<KillEvent[]> {
    return this.db
      .select({
        matchId: matchEvents.matchId,
        actionType: matchEvents.actionType,
        actingMatchTeamId: matchEvents.actingMatchTeamId,
        consequencePlayerId: matchEvents.consequencePlayerId,
        consequenceMatchTeamId: matchEvents.consequenceMatchTeamId,
      })
      .from(matchEvents)
      .innerJoin(matches, eq(matches.id, matchEvents.matchId))
      .where(
        and(
          eq(matchEvents.actingPlayerId, playerId),
          eq(matchEvents.consequenceType, 'death'),
        ),
      )
      .orderBy(desc(matches.playedAt), desc(matchEvents.id))
      .limit(limit);
  }

  /**
   * One kill event's victim, mirroring `getKillerInfo`'s resolution with the
   * acting and consequence roles swapped: a named victim wins outright, then a
   * recorded victim side, then every side except the perpetrator's own.
   */
  private async resolveKillEntry(
    event: KillEvent,
    context: { sides: MatchSide[]; killerTeamId: number | undefined },
  ): Promise<PlayerKillEntry> {
    const { sides, killerTeamId } = context;
    const viaFoul = event.actionType === 'foul';

    if (event.consequencePlayerId !== null) {
      const victim = await this.findPlayerSummary(event.consequencePlayerId);
      const victimSide = sides.find((side) => side.teamId === victim?.teamId);
      if (victim !== undefined && victimSide !== undefined) {
        return {
          kind: 'player',
          playerId: event.consequencePlayerId,
          playerName: victim.playerName,
          positionName: victim.positionName,
          ...this.toKillerTeam(victimSide),
          viaFoul,
        };
      }
      // Defensive fallback, same as `getKillerInfo`'s: the event names a
      // victim, but either no such player row exists or their team is not one
      // of this match's sides. Fall through to side-based resolution.
    }

    // With no recorded victim side, every side except the perpetrator's own is
    // a candidate — identified by the acting side when recorded, and otherwise
    // by the perpetrator's own player row.
    const killerMatchTeamId =
      event.actingMatchTeamId ??
      sides.find((side) => side.teamId === killerTeamId)?.matchTeamId;
    const candidates =
      event.consequenceMatchTeamId === null
        ? sides.filter((side) => side.matchTeamId !== killerMatchTeamId)
        : sides.filter(
            (side) => side.matchTeamId === event.consequenceMatchTeamId,
          );

    if (candidates.length === 0) {
      return { kind: 'unknown', viaFoul };
    }
    if (candidates.length > 1) {
      return {
        kind: 'ambiguousTeams',
        teams: candidates.map((side) => this.toKillerTeam(side)),
        viaFoul,
      };
    }
    return { kind: 'team', ...this.toKillerTeam(candidates[0]), viaFoul };
  }
}
