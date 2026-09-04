import type {
  ExternalId,
  ResolveResult,
  UpsertPosition,
} from '@blood-bowl-tracker/api-contract';
import type { Db, Position } from '@blood-bowl-tracker/db';
import {
  competitionTeams,
  DB,
  eras,
  players,
  positionExternalIds,
  positions,
  positionsRaceEras,
  raceEras,
  races,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  countDistinct,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
} from 'drizzle-orm';

import { countRows } from '../shared/count-all';
import { LikePatternService } from '../shared/like-pattern.service';
import { resolveByExternalIds } from '../shared/resolve-by-external-ids';
import { upsertByExternalIds } from '../shared/upsert-by-external-ids';
import { UpsertConflictError } from '../shared/upsert-conflict-error';

export class PositionUpsertConflictError extends UpsertConflictError {}

export interface SyncPositionRaceErasData {
  positionId: number;
  raceEras: { raceId: number; eraId: number }[];
}

/**
 * A position's header for its deep dive: its name plus every race that has it
 * available in some era. More than one race is genuinely possible — a
 * position reaches races through `positions_race_eras -> race_eras` — and the
 * same race repeats once per era there, so the list is deduplicated.
 */
export interface PositionHeader {
  name: string;
  races: { id: number; name: string }[];
}

/**
 * One player who has held a position, with their career SPP total. Only
 * players whose `spp_total` has been populated by a source appear, which is
 * what makes `sppTotal` non-nullable here.
 */
export interface PositionTopPlayer {
  id: number;
  name: string;
  sppTotal: number;
}

@Injectable()
export class PositionsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly likePattern: LikePatternService,
  ) {}

  async upsert(
    data: UpsertPosition,
  ): Promise<{ position: Position; created: boolean }> {
    const { row: position, created } = await upsertByExternalIds<
      typeof positions,
      typeof positionExternalIds
    >({
      db: this.db,
      entityTable: positions,
      entityIdColumn: positions.id,
      values: { name: data.name, isStarPlayer: data.isStarPlayer },
      externalIdTable: positionExternalIds,
      ownerIdColumn: positionExternalIds.positionId,
      externalSystemIdColumn: positionExternalIds.externalSystemId,
      externalIdColumn: positionExternalIds.externalId,
      externalIds: data.externalIds,
      ConflictErrorClass: PositionUpsertConflictError,
      entityLabelPlural: 'positions',
      buildExternalIdRow: (positionId, pair) => ({ positionId, ...pair }),
      // A star position's external id can happen to collide with an
      // already-upserted *regular* position's id (or vice versa): both are
      // "one matched owner" as far as the external-id lookup is concerned,
      // but applying the update would silently turn one kind of position
      // into the other. Reject that as a conflict instead of applying it.
      detectSemanticConflict: (existingRow, values) =>
        values.isStarPlayer !== undefined &&
        existingRow.isStarPlayer !== values.isStarPlayer,
    });

    return { position, created };
  }

  /**
   * Resolve one external-id pair to the position that already declares it.
   * The read-only half of what `upsert` does internally, exposed on its own
   * so a caller can reference a position imported in an earlier run, phase
   * or tool.
   */
  async resolve(externalId: ExternalId): Promise<ResolveResult> {
    const [result] = await this.resolveBatch([externalId]);
    return result;
  }

  resolveBatch(externalIds: readonly ExternalId[]): Promise<ResolveResult[]> {
    return resolveByExternalIds({
      db: this.db,
      externalIdTable: positionExternalIds,
      ownerIdColumn: positionExternalIds.positionId,
      externalSystemIdColumn: positionExternalIds.externalSystemId,
      externalIdColumn: positionExternalIds.externalId,
      externalIds,
    });
  }

  /**
   * A position's name and races, or `undefined` when no such position exists.
   *
   * Left joins throughout so a position with no `positions_race_eras` rows
   * still resolves — with an empty race list — rather than reading as
   * missing. The join fans out one row per race era, so races are
   * deduplicated in memory by id; a single query is cheaper here than a
   * second round trip for what is at most a handful of rows.
   */
  async findById(id: number): Promise<PositionHeader | undefined> {
    const rows = await this.db
      .select({
        name: positions.name,
        raceId: races.id,
        raceName: races.name,
      })
      .from(positions)
      .leftJoin(
        positionsRaceEras,
        eq(positionsRaceEras.positionId, positions.id),
      )
      .leftJoin(raceEras, eq(raceEras.id, positionsRaceEras.raceEraId))
      .leftJoin(races, eq(races.id, raceEras.raceId))
      .where(eq(positions.id, id))
      .orderBy(asc(races.name));

    const first = rows[0];
    if (first === undefined) {
      return undefined;
    }
    const racesById = new Map<number, { id: number; name: string }>();
    for (const row of rows) {
      if (row.raceId !== null && row.raceName !== null) {
        racesById.set(row.raceId, { id: row.raceId, name: row.raceName });
      }
    }
    return { name: first.name, races: [...racesById.values()] };
  }

  /**
   * How many players have ever held this position. Every hire of a star, and
   * every player of a regular position, is its own `players` row, so this is
   * a row count — `countDistinct` rather than plain `count` costs nothing
   * here (there is no join that could duplicate a row) and reads as honest
   * about what the id being counted actually is.
   */
  async countPlayers(positionId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(players.id) })
      .from(players)
      .where(eq(players.positionId, positionId));
    return row.count;
  }

  /**
   * The players who have held this position with the most career SPP, ties
   * broken by name so the order is stable across calls.
   *
   * `spp_total` is nullable (NULL means no source has populated it), and a
   * player with no total is not "zero SPP" — it is unknown — so those rows
   * are excluded rather than sorted to the bottom. That filter is also what
   * makes the non-nullable `sppTotal` in the cast below true.
   */
  listTopPlayersBySpp(
    positionId: number,
    limit: number,
  ): Promise<PositionTopPlayer[]> {
    return this.db
      .select({
        id: players.id,
        name: players.name,
        sppTotal: players.sppTotal,
      })
      .from(players)
      .where(
        and(eq(players.positionId, positionId), isNotNull(players.sppTotal)),
      )
      .orderBy(desc(players.sppTotal), asc(players.name))
      .limit(limit) as Promise<PositionTopPlayer[]>;
  }

  /**
   * Name-prefix search backing `/deepdive`'s position autocomplete. Star
   * positions are deliberately *not* excluded: the position deep dive shows a
   * position's characteristics per rules set, which a star has just like any
   * other position, and the star-player target answers a different question
   * (which teams hired them).
   */
  searchByNamePrefix(
    prefix: string,
    limit: number,
  ): Promise<{ id: number; name: string }[]> {
    return this.db
      .select({ id: positions.id, name: positions.name })
      .from(positions)
      .where(ilike(positions.name, `${this.likePattern.escape(prefix)}%`))
      .orderBy(asc(positions.name))
      .limit(limit);
  }

  /**
   * Upsert-only: inserts any of `data.raceEras` not already present, but
   * never removes a previously persisted row. Availability evidence
   * accumulates and is never revoked by a later sync.
   */
  async syncRaceEras(
    data: SyncPositionRaceErasData,
  ): Promise<{ positionId: number; raceEraIds: number[] }> {
    if (data.raceEras.length === 0) {
      return { positionId: data.positionId, raceEraIds: [] };
    }

    const raceIds = [...new Set(data.raceEras.map((re) => re.raceId))];
    const raceEraRows = await this.db
      .select({
        id: raceEras.id,
        raceId: raceEras.raceId,
        eraId: raceEras.eraId,
      })
      .from(raceEras)
      .where(inArray(raceEras.raceId, raceIds));

    const idByKey = new Map(
      raceEraRows.map((r) => [`${r.raceId}:${r.eraId}`, r.id]),
    );

    const resolvedIds: number[] = [];
    for (const re of data.raceEras) {
      const id = idByKey.get(`${re.raceId}:${re.eraId}`);
      if (id !== undefined) {
        resolvedIds.push(id);
      }
    }
    const raceEraIds = [...new Set(resolvedIds)];

    if (raceEraIds.length > 0) {
      const existing = await this.db
        .select({ raceEraId: positionsRaceEras.raceEraId })
        .from(positionsRaceEras)
        .where(eq(positionsRaceEras.positionId, data.positionId));
      const existingIds = new Set(existing.map((r) => r.raceEraId));
      const toInsert = raceEraIds.filter((id) => !existingIds.has(id));
      if (toInsert.length > 0) {
        await this.db.insert(positionsRaceEras).values(
          toInsert.map((raceEraId) => ({
            positionId: data.positionId,
            raceEraId,
          })),
        );
      }
    }

    return { positionId: data.positionId, raceEraIds };
  }

  countAll(): Promise<number> {
    return countRows(this.db, positions);
  }

  async countByEra(eraId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(positionsRaceEras.positionId) })
      .from(positionsRaceEras)
      .innerJoin(raceEras, eq(raceEras.id, positionsRaceEras.raceEraId))
      .where(eq(raceEras.eraId, eraId));
    return row.count;
  }

  async countByLeague(leagueId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(positionsRaceEras.positionId) })
      .from(positionsRaceEras)
      .innerJoin(raceEras, eq(raceEras.id, positionsRaceEras.raceEraId))
      .innerJoin(eras, eq(eras.id, raceEras.eraId))
      .where(eq(eras.leagueId, leagueId));
    return row.count;
  }

  async countByCompetition(competitionId: number): Promise<number> {
    const [row] = await this.db
      .select({ count: countDistinct(positionsRaceEras.positionId) })
      .from(competitionTeams)
      .innerJoin(teamEras, eq(teamEras.id, competitionTeams.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .innerJoin(
        raceEras,
        and(
          eq(raceEras.raceId, teams.raceId),
          eq(raceEras.eraId, teamEras.eraId),
        ),
      )
      .innerJoin(
        positionsRaceEras,
        eq(positionsRaceEras.raceEraId, raceEras.id),
      )
      .where(eq(competitionTeams.competitionId, competitionId));
    return row.count;
  }
}
