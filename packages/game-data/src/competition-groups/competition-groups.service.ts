import type { UpsertCompetitionGroup } from '@blood-bowl-tracker/api-contract';
import type { CompetitionGroup, Db } from '@blood-bowl-tracker/db';
import {
  competitionGroupExternalIds,
  competitionGroups,
  DB,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { upsertByExternalIds } from '../shared/upsert-by-external-ids';
import { UpsertConflictError } from '../shared/upsert-conflict-error';

export class CompetitionGroupUpsertConflictError extends UpsertConflictError {}

@Injectable()
export class CompetitionGroupsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Matched by external ids like every other entity's upsert. No source system
   * names a competition group, but tools/import-manual derives one under the
   * synthetic "Name" system from the group's curated name, which is what lets
   * its two separate import processes resolve the same group onto the same row
   * (see packages/db/src/schema/competition-groups.ts).
   */
  async upsert(
    data: UpsertCompetitionGroup,
  ): Promise<{ competitionGroup: CompetitionGroup; created: boolean }> {
    const { row: competitionGroup, created } = await upsertByExternalIds<
      typeof competitionGroups,
      typeof competitionGroupExternalIds
    >({
      db: this.db,
      entityTable: competitionGroups,
      entityIdColumn: competitionGroups.id,
      values: { name: data.name, leagueId: data.leagueId },
      externalIdTable: competitionGroupExternalIds,
      ownerIdColumn: competitionGroupExternalIds.competitionGroupId,
      externalSystemIdColumn: competitionGroupExternalIds.externalSystemId,
      externalIdColumn: competitionGroupExternalIds.externalId,
      externalIds: data.externalIds,
      ConflictErrorClass: CompetitionGroupUpsertConflictError,
      entityLabelPlural: 'competition groups',
      buildExternalIdRow: (competitionGroupId, pair) => ({
        competitionGroupId,
        ...pair,
      }),
    });

    return { competitionGroup, created };
  }
}
