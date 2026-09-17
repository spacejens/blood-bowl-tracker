import { NAME_EXTERNAL_SYSTEM } from '@blood-bowl-tracker/domain-enums';
import { Injectable } from '@nestjs/common';

import { ExternalSystemBootstrapService } from './external-system-bootstrap.service';
import { ImportResultService } from './import-result.service';
import { NameExternalIdService } from './name-external-id.service';
import { PositionRulesSetSkillsImportService } from './position-rules-set-skills-import.service';
import { SkillRulesSetsImportService } from './skill-rules-sets-import.service';
import { SkillsImportService } from './skills-import.service';
import type { ImportError } from './types';

/**
 * One starting skill reference: the skill's bare name (its identity, used for
 * upsert/curation lookup) and, separately, any position-specific attribute
 * value BB2020-era rules attach to it (e.g. "4+" for "Loner (4+)", "+1" for
 * "Mighty Blow (+1)"). Keeping these apart is the whole point of this type --
 * see position-rules-set-skills.ts's attributeValue column and the schema
 * commit that introduced it.
 */
export interface StartingSkillRef {
  name: string;
  attributeValue?: string;
  /**
   * Whether the SOURCE data marks this skill as BB2025-elite. It is never
   * written anywhere -- `skill_rules_sets.is_elite` is curated, not
   * source-derived -- it exists only so this service can cross-check the
   * source against the curated value and report a disagreement. A source with
   * no concept of eliteness (BBL) supplies `false`.
   */
  isElite: boolean;
  /**
   * Extra external ids to register on this skill at upsert time, alongside
   * the synthetic Name id -- e.g. every TP skillMasterId ever seen for this
   * name. Only TP supplies these; BBL has no numeric skill id of its own.
   * Ignored once the skill has already been upserted this run, since a name
   * is upserted at most once per run (see `skillIdsByName`), so a ref must
   * carry the COMPLETE set rather than growing it ref by ref.
   */
  externalIds?: { externalSystemId: number; externalId: string }[];
  /**
   * A skill id already resolved elsewhere -- TP resolving a skillMasterId no
   * downloaded file ever names, via its curated tourplay.net external id.
   * When present, the upsert-by-name step is skipped entirely and this id is
   * used directly; every other check (curated category, elite mismatch,
   * dedup, error reporting) runs completely unchanged, because those are
   * already keyed by skill id rather than by name. `name` is then only a
   * cache key and an error-message token -- it never reaches the database.
   */
  skillId?: number;
}

/** positionId -> rulesSetId -> the position's starting skill refs there. */
export type StartingSkillNames = Map<number, Map<number, StartingSkillRef[]>>;

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
 *
 * A skill whose source data disagrees with the curated row's `isElite` is
 * likewise an ImportError pointing at tools/import-manual, reported once per
 * (skill, rules set). Unlike the curation gap, the starting skill is still
 * recorded: the skill genuinely exists under that rules set, `isElite` is not
 * part of what position_rules_set_skills stores, and dropping a real starting
 * skill over a curation flag would lose data for no gain.
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
    /**
     * Skill name -> what the curated table says about it, keyed by rules set
     * id (the value is the curated `isElite`), or undefined when the read
     * itself failed. A rules set absent from the map has no curated row at
     * all, which is the curation gap reported below.
     */
    const curatedBySkillName = new Map<
      string,
      Map<number, boolean> | undefined
    >();
    /** `${name}|${rulesSetId}` pairs already reported as uncurated. */
    const reportedGaps = new Set<string>();
    /** `${name}|${rulesSetId}` pairs already reported as an elite mismatch. */
    const reportedEliteMismatches = new Set<string>();

    let synced = 0;
    for (const [positionId, refsByRulesSetId] of skillNamesByPositionId) {
      for (const [rulesSetId, refs] of refsByRulesSetId) {
        /**
         * Keyed by the resolved skill id, not the raw name/attributeValue
         * pair: the stored row is keyed on (positionRulesSetId, skillId), so
         * two refs that resolve to the same skill -- whether identical names
         * or two spellings a curated merge folds into one skill, e.g.
         * "Claw"/"Claws" -- would otherwise both reach the sync call and get
         * the whole batch rejected as a duplicate pair.
         */
        const entriesBySkillId = new Map<
          number,
          {
            positionId: number;
            rulesSetId: number;
            skillId: number;
            attributeValue?: string;
          }
        >();
        /** Skill ids dropped for conflicting attribute values, never re-added. */
        const excludedSkillIds = new Set<number>();
        for (const ref of refs) {
          const { name, attributeValue } = ref;
          const skillId = await this.resolveSkillId({
            ref,
            nameSystemId,
            skillIdsByName,
            errors,
          });
          if (skillId === undefined || excludedSkillIds.has(skillId)) {
            continue;
          }
          const existing = entriesBySkillId.get(skillId);
          if (existing !== undefined) {
            if (
              existing.attributeValue !== undefined &&
              attributeValue !== undefined &&
              existing.attributeValue !== attributeValue
            ) {
              // Two refs for the same skill disagree on its attribute value
              // (e.g. two positions' raw data both list this skill but one
              // carries a stale or mistranscribed value) -- there is no
              // correct value to pick, so drop the skill entirely rather
              // than silently keep whichever ref happened to resolve first.
              entriesBySkillId.delete(skillId);
              excludedSkillIds.add(skillId);
              errors.push(
                this.importResults.error({
                  item: { skill: name, positionId, rulesSetId },
                  message:
                    `Skill "${name}" was listed with conflicting attribute ` +
                    `values ("${existing.attributeValue}" and ` +
                    `"${attributeValue}") for position ${positionId} under ` +
                    `rules set ${rulesSetId}, so it is left out of that ` +
                    "position's starting skills there.",
                }),
              );
              continue;
            }
            // Keep whichever ref actually carries a value; two undefineds or
            // two identical values need no change.
            existing.attributeValue ??= attributeValue;
            continue;
          }
          const curated = await this.curatedRulesSets({
            name,
            skillId,
            curatedBySkillName,
            errors,
          });
          if (curated === undefined) {
            // The category read itself failed and already recorded its own
            // error; piling a second "no curated category" error on top
            // would be misleading, so skip the curation-gap check entirely.
            continue;
          }
          const curatedIsElite = curated.get(rulesSetId);
          if (curatedIsElite === undefined) {
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
          if (curatedIsElite !== ref.isElite) {
            const key = `${name}|${rulesSetId}`;
            if (!reportedEliteMismatches.has(key)) {
              reportedEliteMismatches.add(key);
              const rulesSetName =
                rulesSetNamesById.get(rulesSetId) ?? `id ${rulesSetId}`;
              errors.push(
                this.importResults.error({
                  item: { skill: name, rulesSet: rulesSetId },
                  message:
                    `Skill "${name}" is curated as ` +
                    `${curatedIsElite ? 'elite' : 'not elite'} for rules set ` +
                    `"${rulesSetName}", but the source data marks it as ` +
                    `${ref.isElite ? 'elite' : 'not elite'}. Correct the ` +
                    'curated value in tools/import-manual ' +
                    '(data/before-other-importers/skills.json5). The starting ' +
                    'skill itself is still recorded -- only the elite marker ' +
                    'disagrees.',
                }),
              );
            }
          }
          entriesBySkillId.set(skillId, {
            positionId,
            rulesSetId,
            skillId,
            attributeValue,
          });
        }
        const entries = [...entriesBySkillId.values()];
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

  /**
   * One skill's database id, upserted at most once per run.
   *
   * A ref that already carries `skillId` (TP resolved it by its curated
   * tourplay.net external id) needs no upsert at all: it is cached under the
   * ref's name and returned as-is, so the rest of the pipeline is untouched.
   * Otherwise the skill is upserted under its Name external id, plus any
   * extra external ids the ref supplies.
   */
  private async resolveSkillId(options: {
    ref: StartingSkillRef;
    nameSystemId: number;
    skillIdsByName: Map<string, number | undefined>;
    errors: ImportError[];
  }): Promise<number | undefined> {
    const { ref, nameSystemId, skillIdsByName, errors } = options;
    const { name } = ref;
    if (skillIdsByName.has(name)) {
      return skillIdsByName.get(name);
    }
    if (ref.skillId !== undefined) {
      skillIdsByName.set(name, ref.skillId);
      return ref.skillId;
    }
    const upserted = await this.skillsImport.upsert(
      {
        name,
        externalIds: [
          {
            externalSystemId: nameSystemId,
            externalId: this.nameExternalId.forSkill(name),
          },
          ...(ref.externalIds ?? []),
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

  /** What the curated table says about one skill, read once per run. */
  private async curatedRulesSets(options: {
    name: string;
    skillId: number;
    curatedBySkillName: Map<string, Map<number, boolean> | undefined>;
    errors: ImportError[];
  }): Promise<Map<number, boolean> | undefined> {
    const { name, skillId, curatedBySkillName, errors } = options;
    if (curatedBySkillName.has(name)) {
      return curatedBySkillName.get(name);
    }
    const rows = await this.skillRulesSetsImport.listSkillRulesSets(
      skillId,
      errors,
    );
    // A failed read already recorded its own error; return undefined so the
    // caller skips the curation-gap check entirely instead of piling a
    // second, misleading "no curated category" error on top of the real
    // read failure.
    const curated =
      rows === undefined
        ? undefined
        : new Map(rows.map((row) => [row.rulesSetId, row.isElite]));
    curatedBySkillName.set(name, curated);
    return curated;
  }
}
