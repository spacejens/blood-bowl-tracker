import type { UpsertCompetitionGroup } from '@blood-bowl-tracker/api-contract';
import type { CompetitionGroup, Db } from '@blood-bowl-tracker/db';
import { competitionGroups, DB } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { UpsertConflictError } from '../shared/upsert-conflict-error';

export class CompetitionGroupUpsertConflictError extends UpsertConflictError {}

@Injectable()
export class CompetitionGroupsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Matched by exact `name`, not by external ids: a competition group has no
   * external ids at all (it is a pure curation concept -- see
   * packages/db/src/schema/competition-groups.ts). This mirrors
   * `TrophiesService`'s name path, including its guard: if two rows ever share
   * a name, picking one arbitrarily would silently corrupt every
   * classification that resolves through it, so this throws instead.
   */
  async upsert(
    data: UpsertCompetitionGroup,
  ): Promise<{ competitionGroup: CompetitionGroup; created: boolean }> {
    const existing = await this.db
      .select()
      .from(competitionGroups)
      .where(eq(competitionGroups.name, data.name));

    if (existing.length > 1) {
      throw new CompetitionGroupUpsertConflictError(
        `Multiple competition groups named "${data.name}"`,
      );
    }

    const values = { name: data.name, leagueId: data.leagueId };

    if (existing[0]) {
      const updated = await this.db
        .update(competitionGroups)
        .set(values)
        .where(eq(competitionGroups.id, existing[0].id))
        .returning();
      return { competitionGroup: updated[0], created: false };
    }

    const inserted = await this.db
      .insert(competitionGroups)
      .values(values)
      .returning();
    return { competitionGroup: inserted[0], created: true };
  }

  /**
   * The whole catalog as id/name pairs. Unordered and unfiltered: the only
   * caller (tools/import-manual) builds a name -> id lookup from it.
   */
  listAll(): Promise<{ id: number; name: string }[]> {
    return this.db
      .select({ id: competitionGroups.id, name: competitionGroups.name })
      .from(competitionGroups);
  }
}
