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
import { and, asc, count, desc, eq, exists, ilike } from 'drizzle-orm';

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
 *
 * A star position has a schema path to a league (`positions_race_eras` ->
 * `race_eras` -> `eras.league_id`), but the "star player exception"
 * (`tools/import-bbl`'s position-race-era importer) links every star as
 * available in essentially every era its races span, so that path would not
 * meaningfully narrow a league/era-scoped query. `listAll()` is therefore
 * unscoped rather than using it.
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
   *
   * Only positions with at least one hire (a `players` row referencing this
   * `positionId`) are returned: this feature's whole purpose is showing which
   * teams have hired a star, so a star position that has never been hired has
   * nothing to show, and offering it in autocomplete would just lead straight
   * to `StarPlayerDeepdiveService`'s not-found message.
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
          exists(
            this.db
              .select({ id: players.id })
              .from(players)
              .where(eq(players.positionId, positions.id)),
          ),
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

  /**
   * Every known star player that has been hired at least once, name-ascending.
   * Mirrors `searchByNamePrefix`'s EXISTS filter for the same reason: a star
   * position that has never been hired has nothing to show, and its deepdive
   * button would dead-end on `StarPlayerDeepdiveService`'s not-found message.
   * Not itself scoped by league/era/competition, unlike
   * `ErasService.listErasWithLeague`/`TrophiesService.listAllWithLeague` — see
   * this class's own doc comment for why a league/era-scoped query over stars
   * would not be meaningful.
   */
  listAll(): Promise<StarPlayerIdentity[]> {
    return this.db
      .select({ positionId: positions.id, name: positions.name })
      .from(positions)
      .where(
        and(
          eq(positions.isStarPlayer, true),
          exists(
            this.db
              .select({ id: players.id })
              .from(players)
              .where(eq(players.positionId, positions.id)),
          ),
        ),
      )
      .orderBy(asc(positions.name));
  }
}
