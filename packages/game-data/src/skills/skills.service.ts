import type {
  ExternalId,
  ResolveResult,
  UpsertSkill,
} from '@blood-bowl-tracker/api-contract';
import type { Db, Skill } from '@blood-bowl-tracker/db';
import {
  and,
  DB,
  eq,
  inArray,
  skillExternalIds,
  skills,
} from '@blood-bowl-tracker/db';
import { Inject, Injectable } from '@nestjs/common';

import { resolveByExternalIds } from '../shared/resolve-by-external-ids';
import { upsertByExternalIds } from '../shared/upsert-by-external-ids';
import { UpsertConflictError } from '../shared/upsert-conflict-error';

export class SkillUpsertConflictError extends UpsertConflictError {}

/** Options for {@link SkillsService.namesByExternalId}. */
export interface SkillNamesByExternalIdOptions {
  externalSystemId: number;
  externalIds: readonly string[];
}

/**
 * Owns the `skills` catalogue: the named player abilities a position can
 * start with and (later) a player can gain.
 *
 * The standard upsert/resolve surface, plus the names behind external ids —
 * a skill row carries nothing but a name. What a skill *means* under a given rules set (its category) belongs
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
      // A skill's name is curated by tools/import-manual once the row exists;
      // only an upsert that says so may overwrite it.
      values: data.renameExisting === true ? { name: data.name } : {},
      createOnlyValues: { name: data.name },
      externalIdTable: skillExternalIds,
      ownerIdColumn: skillExternalIds.skillId,
      externalSystemIdColumn: skillExternalIds.externalSystemId,
      externalIdColumn: skillExternalIds.externalId,
      externalIds: data.externalIds,
      ConflictErrorClass: SkillUpsertConflictError,
      entityLabelPlural: 'skills',
      buildExternalIdRow: (skillId, externalId) => ({ skillId, ...externalId }),
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

  /**
   * The name of the skill declaring each given external id of one system,
   * keyed by external id, in one query. An id no skill declares is left out.
   * Lets an importer tell what a source's bare skill id is when the source
   * names it nowhere.
   */
  async namesByExternalId({
    externalSystemId,
    externalIds,
  }: SkillNamesByExternalIdOptions): Promise<Map<string, string>> {
    if (externalIds.length === 0) {
      return new Map();
    }
    const rows = await this.db
      .select({ externalId: skillExternalIds.externalId, name: skills.name })
      .from(skillExternalIds)
      .innerJoin(skills, eq(skills.id, skillExternalIds.skillId))
      .where(
        and(
          eq(skillExternalIds.externalSystemId, externalSystemId),
          inArray(skillExternalIds.externalId, [...externalIds]),
        ),
      );
    return new Map(rows.map((row) => [row.externalId, row.name]));
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
