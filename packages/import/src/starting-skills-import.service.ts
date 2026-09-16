import { NAME_EXTERNAL_SYSTEM } from '@blood-bowl-tracker/domain-enums';
import { Injectable } from '@nestjs/common';

import { ExternalSystemBootstrapService } from './external-system-bootstrap.service';
import { ImportResultService } from './import-result.service';
import { NameExternalIdService } from './name-external-id.service';
import { PositionRulesSetSkillsImportService } from './position-rules-set-skills-import.service';
import { SkillRulesSetsImportService } from './skill-rules-sets-import.service';
import { SkillsImportService } from './skills-import.service';
import type { ImportError } from './types';

/** positionId -> rulesSetId -> the position's starting skill names there. */
export type StartingSkillNames = Map<number, Map<number, string[]>>;

/**
 * Turns "this position starts with these skill names under these rules sets"
 * into the three writes that actually record it: upsert the skill (by its
 * bare name under the synthetic "Name" system, which is what makes BBL, TP
 * and the curated files land on one row), check the curated category exists
 * for that rules set, and sync the association.
 *
 * Shared rather than duplicated per tool: BBL and TP differ only in how they
 * arrive at the names (an HTML column vs. an id lookup), not in what happens
 * afterwards.
 *
 * A skill with no curated skill_rules_sets row for a rules set is an
 * ImportError pointing the developer at tools/import-manual, reported once per
 * (skill, rules set) rather than once per position that lists it -- the same
 * do-not-repeat-a-known-gap policy TpMercenaryCharacteristicsService follows.
 * That error names the rules set by `rulesSetNamesById`'s NAME, not its bare
 * database id, so an operator can act on it without hand-querying the
 * database -- the same precedent TpMercenaryCharacteristicsService's own
 * error messages follow. A rules set id missing from that map (should not
 * happen in practice) falls back to `id ${rulesSetId}` rather than throwing.
 * One sync call per (position, rules set): the server rejects a batch
 * all-or-nothing, so a smaller batch keeps one bad skill from costing a
 * position its other rules sets.
 */
@Injectable()
export class StartingSkillsImportService {
  constructor(
    private readonly skillsImport: SkillsImportService,
    private readonly skillRulesSetsImport: SkillRulesSetsImportService,
    private readonly positionRulesSetSkillsImport: PositionRulesSetSkillsImportService,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly importResults: ImportResultService,
    private readonly nameExternalId: NameExternalIdService,
  ) {}

  async syncStartingSkills(
    skillNamesByPositionId: StartingSkillNames,
    rulesSetNamesById: Map<number, string>,
    errors: ImportError[],
  ): Promise<number> {
    const bootstrap = await this.externalSystemBootstrap.bootstrap([
      NAME_EXTERNAL_SYSTEM,
    ]);
    if (!bootstrap.ok) {
      errors.push(bootstrap.error);
      return 0;
    }
    const [nameSystemId] = bootstrap.ids;

    /** Skill name -> its database id, or undefined when its upsert failed. */
    const skillIdsByName = new Map<string, number | undefined>();
    /** Skill name -> the rules set ids it has a curated category under. */
    const rulesSetIdsBySkillName = new Map<string, Set<number>>();
    /** `${name}|${rulesSetId}` pairs already reported as uncurated. */
    const reportedGaps = new Set<string>();

    let synced = 0;
    for (const [positionId, namesByRulesSetId] of skillNamesByPositionId) {
      for (const [rulesSetId, names] of namesByRulesSetId) {
        const entries: {
          positionId: number;
          rulesSetId: number;
          skillId: number;
        }[] = [];
        for (const name of new Set(names)) {
          const skillId = await this.resolveSkillId({
            name,
            nameSystemId,
            skillIdsByName,
            errors,
          });
          if (skillId === undefined) {
            continue;
          }
          const rulesSetIds = await this.categoryRulesSetIds({
            name,
            skillId,
            rulesSetIdsBySkillName,
            errors,
          });
          if (!rulesSetIds.has(rulesSetId)) {
            const key = `${name}|${rulesSetId}`;
            if (!reportedGaps.has(key)) {
              reportedGaps.add(key);
              const rulesSetName =
                rulesSetNamesById.get(rulesSetId) ?? `id ${rulesSetId}`;
              errors.push(
                this.importResults.error({
                  item: { skill: name, rulesSet: rulesSetId },
                  message:
                    `Skill "${name}" has no curated category for rules set ` +
                    `"${rulesSetName}", so it cannot be recorded as a ` +
                    'starting skill there. Curate one in tools/import-manual ' +
                    '(data/before-other-importers/skills.json5).',
                }),
              );
            }
            continue;
          }
          entries.push({ positionId, rulesSetId, skillId });
        }
        if (entries.length === 0) {
          continue;
        }
        const result =
          await this.positionRulesSetSkillsImport.syncPositionRulesSetSkills(
            { entries },
            errors,
          );
        if (result) {
          synced += entries.length;
        }
      }
    }
    return synced;
  }

  /** One skill's database id, upserted at most once per run. */
  private async resolveSkillId(options: {
    name: string;
    nameSystemId: number;
    skillIdsByName: Map<string, number | undefined>;
    errors: ImportError[];
  }): Promise<number | undefined> {
    const { name, nameSystemId, skillIdsByName, errors } = options;
    if (skillIdsByName.has(name)) {
      return skillIdsByName.get(name);
    }
    const upserted = await this.skillsImport.upsert(
      {
        name,
        externalIds: [
          {
            externalSystemId: nameSystemId,
            externalId: this.nameExternalId.forSkill(name),
          },
        ],
      },
      errors,
    );
    // A failed upsert already recorded its own error; caching undefined keeps
    // it from being retried (and re-reported) for every other position.
    const id = upserted?.id;
    skillIdsByName.set(name, id);
    return id;
  }

  /** The rules set ids one skill has a curated category under, read once. */
  private async categoryRulesSetIds(options: {
    name: string;
    skillId: number;
    rulesSetIdsBySkillName: Map<string, Set<number>>;
    errors: ImportError[];
  }): Promise<Set<number>> {
    const { name, skillId, rulesSetIdsBySkillName, errors } = options;
    const cached = rulesSetIdsBySkillName.get(name);
    if (cached) {
      return cached;
    }
    const rows = await this.skillRulesSetsImport.listSkillRulesSets(
      skillId,
      errors,
    );
    // A failed read already recorded its own error; an empty set then makes
    // every entry for this skill report the curation gap instead, which is the
    // same conservative outcome as a genuinely uncurated skill.
    const ids = new Set((rows ?? []).map((row) => row.rulesSetId));
    rulesSetIdsBySkillName.set(name, ids);
    return ids;
  }
}
