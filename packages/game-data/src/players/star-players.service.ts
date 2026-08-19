import type { Db } from '@blood-bowl-tracker/db';
import {
  coaches,
  DB,
  players,
  positions,
  races,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, ilike } from 'drizzle-orm';

import { LikePatternService } from '../shared/like-pattern.service';

/**
 * A star player's identity. A star is not a `players` row: it is a
 * `positions` row with `is_star_player = true`, and every time a team hires
 * that star a *new* `players` row is created pointing at the same position
 * (see issue #245). So a star's id is its `positions.id`, and its display
 * name is `positions.name`.
 */
export interface StarPlayerIdentity {
  positionId: number;
  name: string;
}

/**
 * One team that has hired a given star, with how many times it did so.
 * `hireCount` is summed across every era the team has existed in: a team can
 * re-hire the same star season after season, and TP additionally creates a
 * fresh hire row per match inducement, so the per-era split carries no
 * meaning a reader would want. This is a deliberate product decision, not a
 * simplification.
 */
export interface StarPlayerHire {
  teamId: number;
  teamName: string;
  raceName: string;
  coachName: string;
  hireCount: number;
}

/**
 * Read-only queries about star player identities, as opposed to
 * `PlayersService`'s queries about individual `players` rows. Its own service
 * both because that is the honest boundary and because `players.service.ts`
 * sits at the repo's 500-line ceiling.
 *
 * A star can in principle have more than one `positions` row if two import
 * sources minted separate rows for the same name; every method here keys off
 * `positions.id`, so such a pair reads as two stars. That is the existing
 * data model's behaviour (`tools/review-player` treats it the same way), not
 * something this service tries to paper over.
 */
@Injectable()
export class StarPlayersService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly likePattern: LikePatternService,
  ) {}

  /**
   * The star identity for one position id, or `undefined` when that position
   * does not exist or is a regular (non-star) position. The
   * `is_star_player` filter is what stops a regular position id typed into
   * the slash command from rendering a bogus "star" deepdive.
   */
  async findById(positionId: number): Promise<StarPlayerIdentity | undefined> {
    const rows = await this.db
      .select({ positionId: positions.id, name: positions.name })
      .from(positions)
      .where(
        and(eq(positions.id, positionId), eq(positions.isStarPlayer, true)),
      );
    return rows[0];
  }

  /**
   * Every team that has ever hired this star, most hires first, ties broken
   * by team name so the order is stable across calls. One row per team, not
   * per team era: the `group by` folds a team's hires across all of its eras
   * into a single total.
   */
  listHiresByTeam(positionId: number): Promise<StarPlayerHire[]> {
    return this.db
      .select({
        teamId: teams.id,
        teamName: teams.name,
        raceName: races.name,
        coachName: coaches.name,
        hireCount: count(players.id),
      })
      .from(players)
      .innerJoin(teamEras, eq(teamEras.id, players.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .innerJoin(races, eq(races.id, teams.raceId))
      .innerJoin(coaches, eq(coaches.id, teams.coachId))
      .where(eq(players.positionId, positionId))
      .groupBy(teams.id, teams.name, races.name, coaches.name)
      .orderBy(desc(count(players.id)), asc(teams.name));
  }

  /**
   * Name-prefix search backing `/deepdive`'s star-player autocomplete. It
   * cannot reuse `PlayersService.searchByNamePrefix`, which deliberately
   * excludes stars (a popular star would otherwise appear once per hiring
   * team). Searching `positions` directly gives exactly one choice per star
   * identity with no grouping needed.
   */
  searchByNamePrefix(
    prefix: string,
    limit: number,
  ): Promise<StarPlayerIdentity[]> {
    return this.db
      .select({ positionId: positions.id, name: positions.name })
      .from(positions)
      .where(
        and(
          eq(positions.isStarPlayer, true),
          ilike(positions.name, `${this.likePattern.escape(prefix)}%`),
        ),
      )
      .orderBy(asc(positions.name))
      .limit(limit);
  }

  /**
   * The star identity behind one individual hire, or `undefined` when that
   * player is a regular player. Lets the regular player deepdive offer a
   * cross-link to the star deepdive without `PlayersService.findById` having
   * to grow two more columns — that file is at the line ceiling.
   */
  async findByPlayerId(
    playerId: number,
  ): Promise<StarPlayerIdentity | undefined> {
    const rows = await this.db
      .select({ positionId: positions.id, name: positions.name })
      .from(players)
      .innerJoin(positions, eq(positions.id, players.positionId))
      .where(and(eq(players.id, playerId), eq(positions.isStarPlayer, true)));
    return rows[0];
  }
}
