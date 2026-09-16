import type {
  ExternalId,
  ResolveResult,
  UpsertSkill,
} from '@blood-bowl-tracker/api-contract';
import type { Db, Skill } from '@blood-bowl-tracker/db';
import { DB, skillExternalIds, skills } from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { resolveByExternalIds } from '../shared/resolve-by-external-ids';
import { upsertByExternalIds } from '../shared/upsert-by-external-ids';
import { UpsertConflictError } from '../shared/upsert-conflict-error';

export class SkillUpsertConflictError extends UpsertConflictError {}

/**
 * Owns the `skills` catalogue: the named player abilities a position can
 * start with and (later) a player can gain.
 *
 * Only the standard upsert/resolve surface — a skill row carries nothing but
 * a name. What a skill *means* under a given rules set (its category) belongs
 * to SkillRulesSetsService, and which positions start with it to
 * PositionRulesSetSkillsService.
 *
 * No `detectSemanticConflict`, unlike PositionsService: a skill row encodes
 * no second identity dimension that an external-id match could silently
 * overwrite.
 */
@Injectable()
export class SkillsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async upsert(data: UpsertSkill): Promise<{ skill: Skill; created: boolean }> {
    const { row: skill, created } = await upsertByExternalIds<
      typeof skills,
      typeof skillExternalIds
    >({
      db: this.db,
      entityTable: skills,
      entityIdColumn: skills.id,
      values: { name: data.name },
      externalIdTable: skillExternalIds,
      ownerIdColumn: skillExternalIds.skillId,
      externalSystemIdColumn: skillExternalIds.externalSystemId,
      externalIdColumn: skillExternalIds.externalId,
      externalIds: data.externalIds,
      ConflictErrorClass: SkillUpsertConflictError,
      entityLabelPlural: 'skills',
      buildExternalIdRow: (skillId, pair) => ({ skillId, ...pair }),
    });

    return { skill, created };
  }

  /**
   * Resolve one external-id pair to the skill that already declares it. The
   * read-only half of what `upsert` does internally, exposed on its own so a
   * caller can reference a skill imported in an earlier run, phase or tool.
   */
  async resolve(externalId: ExternalId): Promise<ResolveResult> {
    const [result] = await this.resolveBatch([externalId]);
    return result;
  }

  resolveBatch(externalIds: readonly ExternalId[]): Promise<ResolveResult[]> {
    return resolveByExternalIds({
      db: this.db,
      externalIdTable: skillExternalIds,
      ownerIdColumn: skillExternalIds.skillId,
      externalSystemIdColumn: skillExternalIds.externalSystemId,
      externalIdColumn: skillExternalIds.externalId,
      externalIds,
    });
  }
}
