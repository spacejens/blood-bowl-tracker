import type { ExternalSystem, NewExternalSystem } from '@blood-bowl-tracker/db';
import type { Db } from '@blood-bowl-tracker/db';
import {
  coachExternalIds,
  competitionExternalIds,
  competitionTeams,
  eraExternalIds,
  eras,
  externalSystems,
  teamEras,
  teams,
} from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, ne } from 'drizzle-orm';

/** Distinct id count across any number of `{ id }` row lists. */
function distinctIdCount(rowLists: { id: number }[][]): number {
  const ids = new Set<number>();
  for (const rows of rowLists) {
    for (const row of rows) ids.add(row.id);
  }
  return ids.size;
}

@Injectable()
export class ExternalSystemsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async upsert(
    data: NewExternalSystem,
  ): Promise<{ system: ExternalSystem; created: boolean }> {
    const existing = await this.db
      .select()
      .from(externalSystems)
      .where(eq(externalSystems.name, data.name));

    if (existing[0]) {
      return { system: existing[0], created: false };
    }

    const result = await this.db
      .insert(externalSystems)
      .values(data)
      .returning();
    return { system: result[0], created: true };
  }

  async countAll(): Promise<number> {
    const [row] = await this.db
      .select({ count: count() })
      .from(externalSystems)
      .where(ne(externalSystems.category, 'bookkeeping'));
    return row.count;
  }

  async countByEra(eraId: number): Promise<number> {
    const direct = await this.db
      .select({ id: externalSystems.id })
      .from(eraExternalIds)
      .innerJoin(
        externalSystems,
        eq(externalSystems.id, eraExternalIds.externalSystemId),
      )
      .where(
        and(
          eq(eraExternalIds.eraId, eraId),
          ne(externalSystems.category, 'bookkeeping'),
        ),
      );
    const viaCoach = await this.db
      .select({ id: externalSystems.id })
      .from(coachExternalIds)
      .innerJoin(
        externalSystems,
        eq(externalSystems.id, coachExternalIds.externalSystemId),
      )
      .innerJoin(teams, eq(teams.coachId, coachExternalIds.coachId))
      .innerJoin(teamEras, eq(teamEras.teamId, teams.id))
      .where(
        and(
          eq(teamEras.eraId, eraId),
          ne(externalSystems.category, 'bookkeeping'),
        ),
      );
    return distinctIdCount([direct, viaCoach]);
  }

  async countByCompetition(competitionId: number): Promise<number> {
    const direct = await this.db
      .select({ id: externalSystems.id })
      .from(competitionExternalIds)
      .innerJoin(
        externalSystems,
        eq(externalSystems.id, competitionExternalIds.externalSystemId),
      )
      .where(
        and(
          eq(competitionExternalIds.competitionId, competitionId),
          ne(externalSystems.category, 'bookkeeping'),
        ),
      );
    const viaCoach = await this.db
      .select({ id: externalSystems.id })
      .from(coachExternalIds)
      .innerJoin(
        externalSystems,
        eq(externalSystems.id, coachExternalIds.externalSystemId),
      )
      .innerJoin(teams, eq(teams.coachId, coachExternalIds.coachId))
      .innerJoin(teamEras, eq(teamEras.teamId, teams.id))
      .innerJoin(competitionTeams, eq(competitionTeams.teamEraId, teamEras.id))
      .where(
        and(
          eq(competitionTeams.competitionId, competitionId),
          ne(externalSystems.category, 'bookkeeping'),
        ),
      );
    return distinctIdCount([direct, viaCoach]);
  }

  async countByLeague(leagueId: number): Promise<number> {
    const direct = await this.db
      .select({ id: externalSystems.id })
      .from(eraExternalIds)
      .innerJoin(
        externalSystems,
        eq(externalSystems.id, eraExternalIds.externalSystemId),
      )
      .innerJoin(eras, eq(eras.id, eraExternalIds.eraId))
      .where(
        and(
          eq(eras.leagueId, leagueId),
          ne(externalSystems.category, 'bookkeeping'),
        ),
      );
    const viaCoach = await this.db
      .select({ id: externalSystems.id })
      .from(coachExternalIds)
      .innerJoin(
        externalSystems,
        eq(externalSystems.id, coachExternalIds.externalSystemId),
      )
      .innerJoin(teams, eq(teams.coachId, coachExternalIds.coachId))
      .innerJoin(teamEras, eq(teamEras.teamId, teams.id))
      .innerJoin(eras, eq(eras.id, teamEras.eraId))
      .where(
        and(
          eq(eras.leagueId, leagueId),
          ne(externalSystems.category, 'bookkeeping'),
        ),
      );
    return distinctIdCount([direct, viaCoach]);
  }

  async listNamesByEra(eraId: number): Promise<string[]> {
    const direct = await this.db
      .select({ name: externalSystems.name })
      .from(eraExternalIds)
      .innerJoin(
        externalSystems,
        eq(externalSystems.id, eraExternalIds.externalSystemId),
      )
      .where(
        and(
          eq(eraExternalIds.eraId, eraId),
          ne(externalSystems.category, 'bookkeeping'),
        ),
      );
    const viaCoach = await this.db
      .select({ name: externalSystems.name })
      .from(coachExternalIds)
      .innerJoin(
        externalSystems,
        eq(externalSystems.id, coachExternalIds.externalSystemId),
      )
      .innerJoin(teams, eq(teams.coachId, coachExternalIds.coachId))
      .innerJoin(teamEras, eq(teamEras.teamId, teams.id))
      .where(
        and(
          eq(teamEras.eraId, eraId),
          ne(externalSystems.category, 'bookkeeping'),
        ),
      );
    const names = new Set<string>();
    for (const row of [...direct, ...viaCoach]) names.add(row.name);
    return [...names].sort();
  }
}
