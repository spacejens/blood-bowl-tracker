import type { Db } from '@blood-bowl-tracker/db';
import {
  asc,
  competitions,
  count,
  DB,
  desc,
  eq,
  eras,
  players,
  positions,
  teamEras,
  teams,
  trophies,
  trophyAwards,
} from '@blood-bowl-tracker/db';
import type { TrophyRecipientKind } from '@blood-bowl-tracker/domain-enums';
import { Inject, Injectable } from '@nestjs/common';

/**
 * One award of a trophy, as the trophy deepdive renders it: which competition
 * it was won in, which era that competition belongs to, which team won it,
 * and — for a player trophy — which player. `playerId`/`playerName` are
 * `null` for a team trophy. The era comes along so the deepdive can head each
 * run of same-era recipients with the era's name instead of repeating it on
 * every row.
 */
export type TrophyRecipient = {
  competitionName: string;
  competitionStartDate: string;
  eraId: number;
  eraName: string;
  /**
   * The era's own span, so the deepdive can date the section heading it builds
   * from these rows without a second lookup. `null` end means ongoing.
   */
  eraStartDate: string;
  eraEndDate: string | null;
  teamId: number;
  teamName: string;
  playerId: number | null;
  playerName: string | null;
  /**
   * The winning player's position, and whether that position is a star
   * player. All three are null on a team-won trophy, exactly like `playerId`
   * and `playerName` — `players` is left-joined, and `positions` is
   * left-joined off it. They can never disagree with `playerId`, because
   * `players.positionId` is `NOT NULL` in the schema, so a present player
   * always has a present position. The trophy deepdive uses
   * `playerIsStarPlayer` to route the recipient's drill-down button to the
   * star player deepdive (keyed by `playerPositionId`) instead of the
   * per-team player one. Mirrors `TeamHonor`.
   */
  playerPositionId: number | null;
  playerPositionName: string | null;
  playerIsStarPlayer: boolean | null;
};

/**
 * One trophy handed out in a single competition, as the competition deepdive
 * renders it: which trophy, whether it goes to a team or a player, the team
 * that won it, and — for a player trophy — the player. `playerId`/`playerName`
 * are `null` for a team trophy. This is the reverse view of `TrophyRecipient`:
 * that one fixes the trophy and lists competitions, this one fixes the
 * competition and lists trophies, so it carries no competition or era columns
 * (a competition belongs to exactly one era, and the caller already knows both).
 */
export type CompetitionTrophyAward = {
  trophyId: number;
  trophyName: string;
  recipientKind: TrophyRecipientKind;
  teamId: number;
  teamName: string;
  playerId: number | null;
  playerName: string | null;
  /**
   * The winning player's position, and whether that position is a star
   * player. All three are null for a team award, for the same reason and
   * with the same left-join shape as `TrophyRecipient.playerPositionId`. The
   * competition deepdive uses `playerIsStarPlayer` to route the award's
   * drill-down button to the star player deepdive (keyed by
   * `playerPositionId`) instead of the per-team player one.
   */
  playerPositionId: number | null;
  playerPositionName: string | null;
  playerIsStarPlayer: boolean | null;
};

/**
 * One honor of a team, as the team deepdive renders it: which trophy was won,
 * in which competition, in which era, and — for a player trophy — which of the
 * team's players won it. `playerId`/`playerName` are `null` for a team trophy.
 *
 * The team itself is not carried: every row is already scoped to the one team
 * that was asked about, which the embed's title names. The era comes along so
 * the deepdive can head each run of same-era honors with the era's name
 * instead of repeating it on every row. Deliberately keyed by `teamId` through
 * `team_eras` rather than by one `teamEraId`, so a future player-scoped
 * sibling can reuse the same join shape with a different filter.
 */
export type TeamHonor = {
  trophyId: number;
  trophyName: string;
  competitionName: string;
  competitionStartDate: string;
  eraId: number;
  eraName: string;
  /**
   * The era's own span, so the deepdive can date the section heading it builds
   * from these rows without a second lookup. `null` end means ongoing.
   */
  eraStartDate: string;
  eraEndDate: string | null;
  playerId: number | null;
  playerName: string | null;
  /**
   * The winning player's position, and whether that position is a star
   * player. All three are null on a team-won trophy, exactly like `playerId`
   * and `playerName` — `players` is left-joined, and `positions` is
   * left-joined off it. They can never disagree with `playerId`, because
   * `players.positionId` is `NOT NULL` in the schema, so a present player
   * always has a present position. The team deepdive uses `playerIsStarPlayer`
   * to route the honor's drill-down button to the star player deepdive
   * (keyed by `playerPositionId`) instead of the per-team player one.
   */
  playerPositionId: number | null;
  playerPositionName: string | null;
  playerIsStarPlayer: boolean | null;
};

/**
 * One honor a player has personally won, as the player deepdive renders it:
 * which trophy, in which competition. The player, their team and their era
 * are not carried: every row is already scoped to the one player that was
 * asked about, and that player has exactly one team and one era for their
 * whole career (a player never changes teams) — both already named by the
 * player deepdive's own header, so repeating them here would add nothing.
 * This is the player-scoped sibling `TeamHonor`'s doc comment anticipated:
 * `trophy_awards.playerId` filters directly to one player's rows, and every
 * one of them is unambiguously a player honor by construction — there is no
 * team/player split to resolve, unlike `TeamHonor`, which mixes both kinds.
 */
export type PlayerHonor = {
  trophyId: number;
  trophyName: string;
  competitionId: number;
  competitionName: string;
  competitionStartDate: string;
};

/**
 * Read-only trophy award listings and counts for the Discord bot's
 * deepdives.
 */
@Injectable()
export class TrophyAwardsQueriesService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Every recipient of one trophy, most recent competition first, capped at
   * exactly `limit` rows — the caller asks for precisely what it intends to
   * show. There is deliberately no `limit + 1` overflow sentinel here: a
   * sentinel row can only ever prove "at least one more exists", so the
   * remainder derived from it would always be 1. Callers that need the real
   * remainder pair this with `countRecipients`.
   *
   * `players` is left-joined because a team trophy's award row carries no
   * player at all; `team_eras` is only a stepping stone to the team's id and
   * name, since the deepdive links to the team, not the era. `eras` is joined
   * through the competition so each recipient row knows which era it belongs to,
   * which is what lets the deepdive head one section per era. Ordering by
   * `eras.startDate` before `competitions.startDate` (both descending) is what
   * guarantees every recipient of one era stays adjacent in the result — the
   * deepdive's era-section grouping relies on that adjacency, and while real
   * eras never overlap in time (so ordering by competition date alone would
   * already produce the same result), sorting on the era's own date first
   * makes that guarantee explicit rather than incidental. `eras.id` sits
   * between them as a tiebreaker: `startDate` carries no uniqueness
   * constraint, so two distinct eras sharing a start date would otherwise
   * sort arbitrarily relative to each other and could interleave. Mirrors
   * the same tiebreak used when listing a competition group's competitions
   * chronologically.
   */
  listRecipients(trophyId: number, limit: number): Promise<TrophyRecipient[]> {
    return (
      this.db
        .select({
          competitionName: competitions.name,
          competitionStartDate: competitions.startDate,
          eraId: eras.id,
          eraName: eras.name,
          eraStartDate: eras.startDate,
          eraEndDate: eras.endDate,
          teamId: teams.id,
          teamName: teams.name,
          playerId: players.id,
          playerName: players.name,
          playerPositionId: positions.id,
          playerPositionName: positions.name,
          playerIsStarPlayer: positions.isStarPlayer,
        })
        .from(trophyAwards)
        .innerJoin(
          competitions,
          eq(competitions.id, trophyAwards.competitionId),
        )
        .innerJoin(eras, eq(eras.id, competitions.eraId))
        .innerJoin(teamEras, eq(teamEras.id, trophyAwards.teamEraId))
        .innerJoin(teams, eq(teams.id, teamEras.teamId))
        .leftJoin(players, eq(players.id, trophyAwards.playerId))
        // Left, not inner: `players` is itself left-joined, so an inner join
        // here would drop every team-won trophy from the list.
        .leftJoin(positions, eq(positions.id, players.positionId))
        .where(eq(trophyAwards.trophyId, trophyId))
        .orderBy(
          desc(eras.startDate),
          desc(eras.id),
          desc(competitions.startDate),
        )
        .limit(limit)
    );
  }

  /**
   * Every trophy handed out in one competition, team awards before player
   * awards, each group by trophy name.
   *
   * `asc(trophies.recipientKind)` is what orders team before player: Postgres
   * orders an enum by declaration order and `trophy_recipient_kind` is
   * declared `['team', 'player']`, so no `CASE` is needed.
   *
   * The trailing `teams.id`/`players.id` tiebreakers are what actually
   * guarantee a deterministic order: neither `recipientKind` nor a trophy,
   * team, or player *name* is unique, so without them two same-named teams
   * tied for one trophy could return in any order on each call.
   */
  listForCompetition(competitionId: number): Promise<CompetitionTrophyAward[]> {
    return (
      this.db
        .select({
          trophyId: trophies.id,
          trophyName: trophies.name,
          recipientKind: trophies.recipientKind,
          teamId: teams.id,
          teamName: teams.name,
          playerId: players.id,
          playerName: players.name,
          playerPositionId: positions.id,
          playerPositionName: positions.name,
          playerIsStarPlayer: positions.isStarPlayer,
        })
        .from(trophyAwards)
        .innerJoin(trophies, eq(trophies.id, trophyAwards.trophyId))
        .innerJoin(teamEras, eq(teamEras.id, trophyAwards.teamEraId))
        .innerJoin(teams, eq(teams.id, teamEras.teamId))
        .leftJoin(players, eq(players.id, trophyAwards.playerId))
        // Left, not inner: `players` is itself left-joined, so an inner join
        // here would drop every team-won award from the list.
        .leftJoin(positions, eq(positions.id, players.positionId))
        .where(eq(trophyAwards.competitionId, competitionId))
        .orderBy(
          asc(trophies.recipientKind),
          asc(trophies.name),
          asc(trophies.id),
          asc(teams.name),
          asc(teams.id),
          asc(players.name),
          asc(players.id),
        )
    );
  }

  /**
   * How many times this trophy has ever been awarded. Kept separate from
   * `listRecipients` so the deepdive can render an exact "…and N more not
   * shown." remainder without fetching every row; a single trophy's award
   * count is one cheap aggregate, so there is no need for the approximate
   * "saturated window" wording `leaderboard.service.ts` falls back to.
   */
  async countRecipients(trophyId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: count() })
      .from(trophyAwards)
      .where(eq(trophyAwards.trophyId, trophyId));
    return row.count;
  }

  /**
   * Every honor one team holds — trophies won by the team itself *and*
   * trophies won by its players — most recent era first, capped at exactly
   * `limit` rows. `trophy_awards` carries no team column: each award points at
   * a `team_eras` row, which is set even for a player award (a player never
   * changes teams), so joining through `team_eras` and filtering on
   * `team_eras.teamId` covers both recipient kinds in one query. `players` is
   * left-joined because a team trophy's award row names no player at all.
   *
   * Ordering mirrors `listRecipients` for the same reason: sorting on the
   * era's own start date first guarantees every honor of one era stays
   * adjacent, which is what lets the deepdive head one section per era, with
   * `eras.id` as a tiebreaker because `startDate` carries no uniqueness
   * constraint. Callers that need an exact remainder pair this with
   * `countByTeam`.
   */
  listByTeam(teamId: number, limit: number): Promise<TeamHonor[]> {
    return (
      this.db
        .select({
          trophyId: trophies.id,
          trophyName: trophies.name,
          competitionName: competitions.name,
          competitionStartDate: competitions.startDate,
          eraId: eras.id,
          eraName: eras.name,
          eraStartDate: eras.startDate,
          eraEndDate: eras.endDate,
          playerId: players.id,
          playerName: players.name,
          playerPositionId: positions.id,
          playerPositionName: positions.name,
          playerIsStarPlayer: positions.isStarPlayer,
        })
        .from(trophyAwards)
        .innerJoin(teamEras, eq(teamEras.id, trophyAwards.teamEraId))
        .innerJoin(trophies, eq(trophies.id, trophyAwards.trophyId))
        .innerJoin(
          competitions,
          eq(competitions.id, trophyAwards.competitionId),
        )
        .innerJoin(eras, eq(eras.id, competitions.eraId))
        .leftJoin(players, eq(players.id, trophyAwards.playerId))
        // Left, not inner: `players` is itself left-joined, so an inner join
        // here would drop every team-won trophy from the list.
        .leftJoin(positions, eq(positions.id, players.positionId))
        .where(eq(teamEras.teamId, teamId))
        .orderBy(
          desc(eras.startDate),
          desc(eras.id),
          desc(competitions.startDate),
        )
        .limit(limit)
    );
  }

  /**
   * How many honors this team holds in total. Kept separate from `listByTeam`
   * for the same reason `countRecipients` is kept separate from
   * `listRecipients`: the deepdive can render an exact "…and N more not
   * shown." remainder without fetching every row.
   */
  async countByTeam(teamId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: count() })
      .from(trophyAwards)
      .innerJoin(teamEras, eq(teamEras.id, trophyAwards.teamEraId))
      .where(eq(teamEras.teamId, teamId));
    return row.count;
  }

  /**
   * Every honor one player has personally won, most recent competition first,
   * capped at exactly `limit` rows. Filters `trophy_awards` directly on
   * `playerId` — no join through `team_eras` is needed (unlike `listByTeam`),
   * since a player award always names the player directly and a player never
   * changes teams, so there is nothing to group or resolve beyond the
   * competition itself.
   *
   * Ordered by `competitions.startDate` descending, with `competitions.id` and
   * `trophies.id` as tiebreakers for full determinism (`startDate` carries no
   * uniqueness constraint, and a player could in principle win more than one
   * trophy in the same competition). Callers that need the true remainder pair
   * this with `countByPlayer`.
   */
  listByPlayer(playerId: number, limit: number): Promise<PlayerHonor[]> {
    return this.db
      .select({
        trophyId: trophies.id,
        trophyName: trophies.name,
        competitionId: competitions.id,
        competitionName: competitions.name,
        competitionStartDate: competitions.startDate,
      })
      .from(trophyAwards)
      .innerJoin(trophies, eq(trophies.id, trophyAwards.trophyId))
      .innerJoin(competitions, eq(competitions.id, trophyAwards.competitionId))
      .where(eq(trophyAwards.playerId, playerId))
      .orderBy(
        desc(competitions.startDate),
        desc(competitions.id),
        desc(trophies.id),
      )
      .limit(limit);
  }

  /**
   * How many honors this player holds in total. Kept separate from
   * `listByPlayer` for the same reason `countByTeam` is kept separate from
   * `listByTeam`: the deepdive can render an exact "…and N more not shown."
   * remainder without fetching every row.
   */
  async countByPlayer(playerId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: count() })
      .from(trophyAwards)
      .where(eq(trophyAwards.playerId, playerId));
    return row.count;
  }
}
