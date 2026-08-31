import type {
  ExternalId,
  PositionRaceEraCharacteristics,
  ResolveResult,
  UpsertPosition,
} from '@blood-bowl-tracker/api-contract';
import type { CharacteristicFormat } from '@blood-bowl-tracker/api-contract';
import type { Db, NewPositionRaceEra, Position } from '@blood-bowl-tracker/db';
import {
  competitionTeams,
  DB,
  eras,
  positionExternalIds,
  positions,
  positionsRaceEras,
  raceEras,
  rulesSets,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, countDistinct, eq, inArray } from 'drizzle-orm';

import { countRows } from '../shared/count-all';
import { resolveByExternalIds } from '../shared/resolve-by-external-ids';
import { upsertByExternalIds } from '../shared/upsert-by-external-ids';
import { UpsertConflictError } from '../shared/upsert-conflict-error';

export class PositionUpsertConflictError extends UpsertConflictError {}

export interface SyncPositionRaceErasData {
  positionId: number;
  raceEras: {
    raceId: number;
    eraId: number;
    characteristics?: PositionRaceEraCharacteristics;
  }[];
}

/**
 * Characteristics that disagree with what their rules set declares: a value
 * supplied for a characteristic the rules set does not have, a missing value
 * for one it does, or a rules set that does not exist at all. Authored-data
 * feedback, not a server fault — the API maps it to BAD_REQUEST so an
 * importer can report it against the offending entry.
 */
export class PositionRulesSetFormatMismatchError extends Error {}

/** The rules set's five format columns, as loaded for validation. */
interface RulesSetFormats {
  moveFormat: CharacteristicFormat;
  strengthFormat: CharacteristicFormat;
  agilityFormat: CharacteristicFormat;
  passingFormat: CharacteristicFormat;
  armourFormat: CharacteristicFormat;
}

/** The five characteristic columns, without the identifying pair. */
interface CharacteristicValues {
  move: number;
  strength: number;
  agility: number;
  passing: number | null;
  armour: number;
}

/**
 * The five characteristics, each paired with the rules-set column declaring
 * its format and the human-readable name used in error messages. Iterating
 * this list is what keeps validation exhaustive: a sixth characteristic
 * means one more line here, not five more branches.
 */
const CHARACTERISTICS = [
  { key: 'move', format: 'moveFormat', label: 'Move' },
  { key: 'strength', format: 'strengthFormat', label: 'Strength' },
  { key: 'agility', format: 'agilityFormat', label: 'Agility' },
  { key: 'passing', format: 'passingFormat', label: 'Passing' },
  { key: 'armour', format: 'armourFormat', label: 'Armour' },
] as const satisfies readonly {
  key: keyof CharacteristicValues;
  format: keyof RulesSetFormats;
  label: string;
}[];

@Injectable()
export class PositionsService {
  constructor(@Inject(DB) private readonly db: Db) {}

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
   * Records a position's availability for the given race eras, and — for
   * entries that carry them — that position's characteristics there.
   *
   * Availability is upsert-only: a race era not already linked is inserted,
   * and a previously persisted link is never removed. Evidence accumulates
   * and is never revoked by a later sync.
   *
   * Characteristics, unlike availability, *are* rewritten: re-syncing an
   * entry with characteristics updates the five columns in place, whether or
   * not the row already existed, so a re-run is idempotent and a better
   * source can correct an earlier one. An entry with no characteristics
   * leaves them alone (a fresh row takes the columns' database defaults).
   *
   * Every supplied `characteristics` is validated against its named rules
   * set's declared formats before anything is written, so one bad entry
   * fails the whole call rather than half-applying it.
   */
  async syncRaceEras(
    data: SyncPositionRaceErasData,
  ): Promise<{ positionId: number; raceEraIds: number[] }> {
    if (data.raceEras.length === 0) {
      return { positionId: data.positionId, raceEraIds: [] };
    }

    await this.validateCharacteristics(data);

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

    // Resolved race-era id -> the characteristics to write for it, if any.
    // A duplicated (raceId, eraId) pair collapses to one row, the last
    // entry's characteristics winning; the pair is the row's natural key, so
    // two entries for it are literally the same row.
    const raceEraIds: number[] = [];
    const characteristicsById = new Map<number, CharacteristicValues>();
    for (const re of data.raceEras) {
      const id = idByKey.get(`${re.raceId}:${re.eraId}`);
      if (id === undefined) {
        continue;
      }
      if (!raceEraIds.includes(id)) {
        raceEraIds.push(id);
      }
      if (re.characteristics) {
        characteristicsById.set(id, {
          move: re.characteristics.move,
          strength: re.characteristics.strength,
          agility: re.characteristics.agility,
          passing: re.characteristics.passing,
          armour: re.characteristics.armour,
        });
      }
    }

    if (raceEraIds.length === 0) {
      return { positionId: data.positionId, raceEraIds };
    }

    const existing = await this.db
      .select({ raceEraId: positionsRaceEras.raceEraId })
      .from(positionsRaceEras)
      .where(eq(positionsRaceEras.positionId, data.positionId));
    const existingIds = new Set(existing.map((r) => r.raceEraId));

    // Two homogeneous inserts rather than one mixed batch: a row with no
    // characteristics must omit the four defaulted columns entirely so the
    // database supplies them, and mixing both shapes in a single multi-row
    // insert would make one statement's column list depend on the other's.
    const plainRows: NewPositionRaceEra[] = [];
    const richRows: NewPositionRaceEra[] = [];
    const updates: { raceEraId: number; values: CharacteristicValues }[] = [];
    for (const raceEraId of raceEraIds) {
      const values = characteristicsById.get(raceEraId);
      if (existingIds.has(raceEraId)) {
        if (values) {
          updates.push({ raceEraId, values });
        }
        continue;
      }
      if (values) {
        richRows.push({ positionId: data.positionId, raceEraId, ...values });
      } else {
        plainRows.push({ positionId: data.positionId, raceEraId });
      }
    }

    if (plainRows.length > 0 || richRows.length > 0 || updates.length > 0) {
      // One transaction around every write: the caller treats this single
      // call as one batch that either wholly succeeds or wholly fails.
      await this.db.transaction(async (tx) => {
        if (plainRows.length > 0) {
          await tx.insert(positionsRaceEras).values(plainRows);
        }
        if (richRows.length > 0) {
          await tx.insert(positionsRaceEras).values(richRows);
        }
        for (const update of updates) {
          await tx
            .update(positionsRaceEras)
            .set(update.values)
            .where(
              and(
                eq(positionsRaceEras.positionId, data.positionId),
                eq(positionsRaceEras.raceEraId, update.raceEraId),
              ),
            );
        }
      });
    }

    return { positionId: data.positionId, raceEraIds };
  }

  /**
   * Load the declared formats of every rules set the batch names, and reject
   * the whole batch if any entry disagrees with them. Issues no query at all
   * when no entry carries characteristics.
   */
  private async validateCharacteristics(
    data: SyncPositionRaceErasData,
  ): Promise<void> {
    const rulesSetIds = [
      ...new Set(
        data.raceEras
          .map((re) => re.characteristics?.rulesSetId)
          .filter((id): id is number => id !== undefined),
      ),
    ];
    if (rulesSetIds.length === 0) {
      return;
    }

    const formatRows = await this.db
      .select({
        id: rulesSets.id,
        moveFormat: rulesSets.moveFormat,
        strengthFormat: rulesSets.strengthFormat,
        agilityFormat: rulesSets.agilityFormat,
        passingFormat: rulesSets.passingFormat,
        armourFormat: rulesSets.armourFormat,
      })
      .from(rulesSets)
      .where(inArray(rulesSets.id, rulesSetIds));
    const formatsById = new Map(formatRows.map((row) => [row.id, row]));

    for (const re of data.raceEras) {
      if (re.characteristics) {
        this.validate(
          data.positionId,
          re.characteristics,
          formatsById.get(re.characteristics.rulesSetId),
        );
      }
    }
  }

  /**
   * Reject characteristics that disagree with their rules set: an `absent`
   * format requires the value to be null, and any other format requires a
   * number.
   */
  private validate(
    positionId: number,
    characteristics: PositionRaceEraCharacteristics,
    formats: RulesSetFormats | undefined,
  ): void {
    const { rulesSetId } = characteristics;
    if (formats === undefined) {
      throw new PositionRulesSetFormatMismatchError(
        `Rules set ${rulesSetId} does not exist, so position ${positionId} cannot have characteristics under it`,
      );
    }
    for (const characteristic of CHARACTERISTICS) {
      const value = characteristics[characteristic.key];
      const format = formats[characteristic.format];
      if (format === 'absent' && value !== null) {
        throw new PositionRulesSetFormatMismatchError(
          `Rules set ${rulesSetId} has no ${characteristic.label} characteristic, but position ${positionId} supplies one`,
        );
      }
      if (format !== 'absent' && value === null) {
        throw new PositionRulesSetFormatMismatchError(
          `Rules set ${rulesSetId} requires a ${characteristic.label} characteristic, but position ${positionId} supplies none`,
        );
      }
    }
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
