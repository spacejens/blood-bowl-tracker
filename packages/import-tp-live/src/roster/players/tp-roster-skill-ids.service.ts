import type { ImportError } from '@blood-bowl-tracker/api-contract';
import { SkillsService } from '@blood-bowl-tracker/game-data';
import { SkillMasterNamesParserService } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { TpImportResultsService } from '../../tp-import-results.service';
import { TpNameExternalIdService } from '../../tp-name-external-id.service';
import { TpSkillIdLookupService } from '../../tp-skill-id-lookup.service';
import { TpUpsertRunnerService } from '../../tp-upsert-runner.service';
import type { TpRosterContext } from '../tp-roster-context.service';

/** One skillMasterId resolved to its database skill. */
export interface TpResolvedSkill {
  skillId: number;
  /**
   * The skill's name as the roster gives it, or `TP skill <id>` for an id
   * resolved only through its TP external id; used in messages only.
   */
  name: string;
}

/** Options for {@link TpRosterSkillIdsService.resolve}. */
export interface ResolveRosterSkillIdsOptions {
  /** Every skillMasterId the roster's players reference. */
  masterIds: ReadonlySet<number>;
  /** The roster's raw TP JSON, scanned for the skill masters it embeds. */
  content: unknown;
  /** TP's roster id, named in the error for an id resolved neither way. */
  rosterId: number;
  context: TpRosterContext;
  errors: ImportError[];
}

/** Options for {@link TpRosterSkillIdsService.upsertByName}. */
interface UpsertByNameOptions {
  name: string;
  /** Skill name -> every TP id the roster gives it. */
  tpIdsByName: Map<string, Set<number>>;
  context: TpRosterContext;
  /** Skill name -> its id, or undefined when its upsert failed. */
  skillIdsByName: Map<string, number | undefined>;
  errors: ImportError[];
}

@Injectable()
export class TpRosterSkillIdsService {
  constructor(
    private readonly skillMasterNames: SkillMasterNamesParserService,
    private readonly skills: SkillsService,
    private readonly skillIdLookup: TpSkillIdLookupService,
    private readonly nameExternalId: TpNameExternalIdService,
    private readonly importResults: TpImportResultsService,
    private readonly runner: TpUpsertRunnerService,
  ) {}

  /**
   * Every referenced skillMasterId resolved to its database skill id, for
   * one roster. TP names a player's skill only by `skillMasterId`, but a
   * roster embeds the full `skillMaster` record wherever a skill appears, so
   * the roster's own raw JSON is scanned for names: a named id upserts its
   * skill by name (once per name) under the Name system and every TP id the
   * roster gives that name -- TP assigns a skill a new id per rules set. Any
   * other id is resolved, in one batch, through a skill already carrying it
   * as a TP external id (registered by an earlier import, or curated in
   * tools/import-manual). An id resolved neither way is reported once and
   * left out of the result; a failed upsert or lookup reports itself.
   */
  async resolve(
    options: ResolveRosterSkillIdsOptions,
  ): Promise<Map<number, TpResolvedSkill>> {
    const { masterIds, content, rosterId, context, errors } = options;
    const resolved = new Map<number, TpResolvedSkill>();
    if (masterIds.size === 0) {
      return resolved;
    }
    const masters = this.skillMasterNames.extract(content);
    const tpIdsByName = this.skillIdLookup.tpIdsByName(masters);
    const skillIdsByName = new Map<string, number | undefined>();
    const unnamed: number[] = [];
    for (const masterId of masterIds) {
      const master = masters.get(masterId);
      if (master === undefined) {
        unnamed.push(masterId);
        continue;
      }
      const skillId = await this.upsertByName({
        name: master.name,
        tpIdsByName,
        context,
        skillIdsByName,
        errors,
      });
      if (skillId !== undefined) {
        resolved.set(masterId, { skillId, name: master.name });
      }
    }
    if (unnamed.length === 0) {
      return resolved;
    }
    const registered = await this.skillIdLookup.resolveByTpId({
      masterIds: unnamed,
      tpSystemId: context.tpSystemId,
      errors,
    });
    if (registered === undefined) {
      return resolved;
    }
    for (const masterId of unnamed) {
      const skillId = registered.get(masterId);
      if (skillId === undefined) {
        errors.push(
          this.importResults.error({
            item: { rosterId, skillMasterId: masterId },
            message:
              `Could not resolve TP skill ${masterId} (roster ${rosterId}): ` +
              'the roster does not name it and no skill carries it as a TP ' +
              "external id, so it is left out of that player's skills. " +
              'Import a roster or match that names it, or curate it in ' +
              'tools/import-manual (skills.json5 in a new batch under data/batches/).',
          }),
        );
        continue;
      }
      resolved.set(masterId, { skillId, name: `TP skill ${masterId}` });
    }
    return resolved;
  }

  /**
   * The skill's id, upserted by name at most once per call. Cached even when
   * the upsert failed, so a failed skill is not retried (and re-reported)
   * for another id of the same name.
   */
  private async upsertByName({
    name,
    tpIdsByName,
    context,
    skillIdsByName,
    errors,
  }: UpsertByNameOptions): Promise<number | undefined> {
    if (skillIdsByName.has(name)) {
      return skillIdsByName.get(name);
    }
    const upserted = await this.runner.record({
      run: () =>
        this.skills.upsert({
          name,
          externalIds: [
            {
              externalSystemId: context.nameSystemId,
              externalId: this.nameExternalId.forSkill(name),
            },
            ...this.skillIdLookup.tpExternalIds(
              tpIdsByName.get(name) ?? [],
              context.tpSystemId,
            ),
          ],
        }),
      item: { skill: name },
      errors,
      buildErrorMessage: (error) =>
        `Failed to upsert skill "${name}": ${this.runner.messageOf(error)}`,
    });
    const id = upserted?.skill.id;
    skillIdsByName.set(name, id);
    return id;
  }
}
