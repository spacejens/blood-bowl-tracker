import type { UpsertCompetition } from '@blood-bowl-tracker/api-contract';
import type { Db } from '@blood-bowl-tracker/db';
import {
  coaches,
  competitionExternalIds,
  competitions,
  competitionTeams,
  DB,
  eq,
  inArray,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { GameDataError } from '../shared/game-data-error';
import { resolveExistingByExternalIds } from '../shared/resolve-existing-by-external-ids';

/**
 * A competition upsert that would break an enrollment rule (see
 * docs/game-concepts/competitions/index.md): a team era from another era, a
 * second team of a coach who already has one in the competition, or an era
 * change its enrolled team eras do not fit. The whole upsert is rejected.
 */
export class CompetitionEnrollmentError extends GameDataError {}

/** One team era as the enrollment rules see it. */
interface EnrollmentRow {
  teamEraId: number;
  eraId: number;
  teamName: string;
  coachId: number;
  coachName: string;
}

interface StoredCompetition {
  id: number;
  name: string;
  eraId: number;
}

/** Which competition, if any, the payload's external ids address. */
type UpsertTarget =
  | { kind: 'new' }
  | { kind: 'existing'; competition: StoredCompetition }
  | { kind: 'ambiguous' };

interface EnrollmentCheck {
  competitionName: string;
  eraId: number;
  enrolled: EnrollmentRow[];
  incoming: EnrollmentRow[];
}

const ENROLLMENT_COLUMNS = {
  teamEraId: teamEras.id,
  eraId: teamEras.eraId,
  teamName: teams.name,
  coachId: teams.coachId,
  coachName: coaches.name,
};

/**
 * Checks a competition upsert against the enrollment rules before
 * `CompetitionsService.upsert` writes anything, so a rejected upsert leaves
 * both the competition row and its enrollment untouched.
 *
 * Only what the upsert changes is checked: team eras it newly enrolls, and
 * an era change. Already-enrolled team eras are never re-validated on their
 * own, so re-importing an unchanged competition succeeds even when its
 * stored enrollment predates these rules and breaks them.
 *
 * The checks are not transactional with the write: they run outside the
 * upsert's transaction. In practice importers write a competition's
 * enrollment sequentially, but a concurrent import could in principle
 * interleave between the check and the write; that is not worth a lock.
 */
@Injectable()
export class CompetitionEnrollmentService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async validate(data: UpsertCompetition): Promise<void> {
    const target = await this.findTarget(data);
    if (target.kind === 'ambiguous') {
      // The upsert itself reports external ids naming several competitions.
      return;
    }
    const stored = target.kind === 'existing' ? target.competition : undefined;
    const eraId = data.eraId ?? stored?.eraId;
    if (eraId === undefined) {
      // A create without an era: the upsert reports the missing field.
      return;
    }
    const competitionName =
      stored?.name ?? data.name ?? 'unnamed new competition';
    const enrolled =
      stored === undefined ? [] : await this.listEnrolled(stored.id);
    if (stored !== undefined && eraId !== stored.eraId) {
      this.checkEraChange({ competitionName, eraId, enrolled });
    }
    const enrolledIds = new Set(enrolled.map((row) => row.teamEraId));
    const newIds = [...new Set(data.teamEraIds)].filter(
      (id) => !enrolledIds.has(id),
    );
    if (newIds.length === 0) {
      return;
    }
    const incoming = await this.listTeamEras(newIds);
    this.checkIncoming({ competitionName, eraId, enrolled, incoming });
  }

  private async findTarget(data: UpsertCompetition): Promise<UpsertTarget> {
    const { ownerIds } = await resolveExistingByExternalIds({
      db: this.db,
      externalIdTable: competitionExternalIds,
      ownerIdColumn: competitionExternalIds.competitionId,
      externalSystemIdColumn: competitionExternalIds.externalSystemId,
      externalIdColumn: competitionExternalIds.externalId,
      externalIds: data.externalIds,
    });
    if (ownerIds.length > 1) {
      return { kind: 'ambiguous' };
    }
    if (ownerIds.length === 0) {
      return { kind: 'new' };
    }
    const [competition] = await this.db
      .select({
        id: competitions.id,
        name: competitions.name,
        eraId: competitions.eraId,
      })
      .from(competitions)
      .where(eq(competitions.id, ownerIds[0]));
    return { kind: 'existing', competition };
  }

  private listEnrolled(competitionId: number): Promise<EnrollmentRow[]> {
    return this.db
      .select(ENROLLMENT_COLUMNS)
      .from(competitionTeams)
      .innerJoin(teamEras, eq(teamEras.id, competitionTeams.teamEraId))
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .innerJoin(coaches, eq(coaches.id, teams.coachId))
      .where(eq(competitionTeams.competitionId, competitionId));
  }

  /**
   * The requested team eras, in request order: the database returns them in
   * no particular order, and a stable order makes a rejection name the same
   * pair on every run.
   */
  private async listTeamEras(teamEraIds: number[]): Promise<EnrollmentRow[]> {
    const rows = await this.db
      .select(ENROLLMENT_COLUMNS)
      .from(teamEras)
      .innerJoin(teams, eq(teams.id, teamEras.teamId))
      .innerJoin(coaches, eq(coaches.id, teams.coachId))
      .where(inArray(teamEras.id, teamEraIds));
    const position = new Map(teamEraIds.map((id, index) => [id, index]));
    return rows.sort(
      (a, b) =>
        (position.get(a.teamEraId) ?? 0) - (position.get(b.teamEraId) ?? 0),
    );
  }

  private checkEraChange({
    competitionName,
    eraId,
    enrolled,
  }: Omit<EnrollmentCheck, 'incoming'>): void {
    const misfit = enrolled.find((row) => row.eraId !== eraId);
    if (misfit !== undefined) {
      throw new CompetitionEnrollmentError(
        `Cannot move competition "${competitionName}" to era ${eraId}: enrolled team era ${misfit.teamEraId} (team "${misfit.teamName}", coach "${misfit.coachName}") belongs to era ${misfit.eraId}`,
      );
    }
  }

  private checkIncoming({
    competitionName,
    eraId,
    enrolled,
    incoming,
  }: EnrollmentCheck): void {
    const byCoach = new Map(enrolled.map((row) => [row.coachId, row]));
    for (const row of incoming) {
      if (row.eraId !== eraId) {
        throw new CompetitionEnrollmentError(
          `Cannot enroll team era ${row.teamEraId} (team "${row.teamName}", coach "${row.coachName}") in competition "${competitionName}": the team era belongs to era ${row.eraId}, but the competition belongs to era ${eraId}`,
        );
      }
      const other = byCoach.get(row.coachId);
      if (other !== undefined) {
        throw new CompetitionEnrollmentError(
          `Cannot enroll team era ${row.teamEraId} (team "${row.teamName}") in competition "${competitionName}": coach "${row.coachName}" already has team era ${other.teamEraId} (team "${other.teamName}") in it`,
        );
      }
      byCoach.set(row.coachId, row);
    }
  }
}
