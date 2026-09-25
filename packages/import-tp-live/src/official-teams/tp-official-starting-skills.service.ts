import type { ImportError } from '@blood-bowl-tracker/api-contract';
import {
  PositionRulesSetSkillsService,
  SkillRulesSetsService,
  SkillsService,
} from '@blood-bowl-tracker/game-data';
import { Injectable } from '@nestjs/common';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpNameExternalIdService } from '../tp-name-external-id.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import type { TpStartingSkillRef } from './tp-official-skill-refs.service';
import type { TpOfficialTeamsContext } from './tp-official-teams-context.service';

/** Options for {@link TpOfficialStartingSkillsService.syncStartingSkills}. */
export interface SyncOfficialStartingSkillsOptions {
  /** positionId -> the position's starting skills under the rules set. */
  refsByPositionId: Map<number, TpStartingSkillRef[]>;
  context: TpOfficialTeamsContext;
  errors: ImportError[];
}

/** One `position_rules_set_skills` row to write. */
interface StartingSkillEntry {
  positionId: number;
  rulesSetId: number;
  skillId: number;
  attributeValue?: string;
}

/** Per-call caches, so each skill is upserted, read and reported at most once. */
interface SkillRunState {
  /** Skill name -> its id, or undefined when its upsert failed. */
  skillIdsByName: Map<string, number | undefined>;
  /** Skill name -> curated rules set id -> isElite, or undefined when the read failed. */
  curatedByName: Map<string, Map<number, boolean> | undefined>;
  reportedGaps: Set<string>;
  reportedEliteMismatches: Set<string>;
}

interface SkillStep {
  ref: TpStartingSkillRef;
  context: TpOfficialTeamsContext;
  state: SkillRunState;
  errors: ImportError[];
}

@Injectable()
export class TpOfficialStartingSkillsService {
  constructor(
    private readonly skills: SkillsService,
    private readonly skillRulesSets: SkillRulesSetsService,
    private readonly positionSkills: PositionRulesSetSkillsService,
    private readonly nameExternalId: TpNameExternalIdService,
    private readonly importResults: TpImportResultsService,
    private readonly runner: TpUpsertRunnerService,
  ) {}

  /**
   * Records each position's starting skills under the rules set: upsert the
   * skill by its bare name under the Name system (plus any TP ids the ref
   * carries) unless it is already resolved, check a curated category exists
   * for the rules set, then write the association. A skill with no curated
   * category is reported once and left out; one whose source elite marker
   * disagrees with the curated one is reported once but still recorded. Two
   * refs to one skill merge, unless they disagree on its attribute value,
   * which drops the skill with one error. One write per position: the
   * server rejects a batch all-or-nothing. Returns the rows written.
   */
  async syncStartingSkills({
    refsByPositionId,
    context,
    errors,
  }: SyncOfficialStartingSkillsOptions): Promise<number> {
    const state: SkillRunState = {
      skillIdsByName: new Map(),
      curatedByName: new Map(),
      reportedGaps: new Set(),
      reportedEliteMismatches: new Set(),
    };
    let written = 0;
    for (const [positionId, refs] of refsByPositionId) {
      const entries = await this.entriesFor({
        positionId,
        refs,
        context,
        state,
        errors,
      });
      if (entries.length === 0) {
        continue;
      }
      const synced = await this.runner.record({
        run: () => this.positionSkills.sync({ entries }),
        item: { positionId, rulesSet: context.rulesSet },
        errors,
        buildErrorMessage: (error) =>
          `Failed to write ${entries.length} starting skill(s) of position ${positionId} (${context.rulesSet}): ${this.runner.messageOf(error)}`,
      });
      if (synced !== undefined) {
        written += entries.length;
      }
    }
    return written;
  }

  /** One position's entries, keyed by skill id so two refs to one skill never collide. */
  private async entriesFor(options: {
    positionId: number;
    refs: TpStartingSkillRef[];
    context: TpOfficialTeamsContext;
    state: SkillRunState;
    errors: ImportError[];
  }): Promise<StartingSkillEntry[]> {
    const { positionId, refs, context, state, errors } = options;
    const bySkillId = new Map<number, StartingSkillEntry>();
    const excluded = new Set<number>();
    for (const ref of refs) {
      const step: SkillStep = { ref, context, state, errors };
      const skillId = await this.skillIdFor(step);
      if (skillId === undefined || excluded.has(skillId)) {
        continue;
      }
      const existing = bySkillId.get(skillId);
      if (existing !== undefined) {
        if (
          existing.attributeValue !== undefined &&
          ref.attributeValue !== undefined &&
          existing.attributeValue !== ref.attributeValue
        ) {
          bySkillId.delete(skillId);
          excluded.add(skillId);
          errors.push(
            this.importResults.error({
              item: {
                skill: ref.name,
                positionId,
                rulesSetId: context.rulesSetId,
              },
              message:
                `Skill "${ref.name}" was listed with conflicting attribute ` +
                `values ("${existing.attributeValue}" and "${ref.attributeValue}") ` +
                `for position ${positionId} under rules set "${context.rulesSet}", ` +
                "so it is left out of that position's starting skills there.",
            }),
          );
        } else if (
          existing.attributeValue === undefined &&
          ref.attributeValue !== undefined
        ) {
          // Keep whichever ref actually carries a value.
          existing.attributeValue = ref.attributeValue;
        }
        continue;
      }
      if (!(await this.isCurated(step, skillId))) {
        continue;
      }
      bySkillId.set(skillId, {
        positionId,
        rulesSetId: context.rulesSetId,
        skillId,
        ...(ref.attributeValue === undefined
          ? {}
          : { attributeValue: ref.attributeValue }),
      });
    }
    return [...bySkillId.values()];
  }

  /** The skill's id, upserted by name at most once per call. */
  private async skillIdFor({
    ref,
    context,
    state,
    errors,
  }: SkillStep): Promise<number | undefined> {
    if (state.skillIdsByName.has(ref.name)) {
      return state.skillIdsByName.get(ref.name);
    }
    if (ref.skillId !== undefined) {
      state.skillIdsByName.set(ref.name, ref.skillId);
      return ref.skillId;
    }
    const upserted = await this.runner.record({
      run: () =>
        this.skills.upsert({
          name: ref.name,
          externalIds: [
            {
              externalSystemId: context.nameSystemId,
              externalId: this.nameExternalId.forSkill(ref.name),
            },
            ...(ref.externalIds ?? []),
          ],
        }),
      item: { skill: ref.name },
      errors,
      buildErrorMessage: (error) =>
        `Failed to upsert skill "${ref.name}": ${this.runner.messageOf(error)}`,
    });
    // Cached even when undefined, so a failed skill is not retried (and
    // re-reported) for every other position listing it.
    const id = upserted?.skill.id;
    state.skillIdsByName.set(ref.name, id);
    return id;
  }

  /**
   * Whether the skill has a curated category under the rules set, reading
   * the curated table once per skill. A failed read already reported itself,
   * so it answers false without piling a curation-gap error on top.
   */
  private async isCurated(step: SkillStep, skillId: number): Promise<boolean> {
    const { ref, context, state, errors } = step;
    if (!state.curatedByName.has(ref.name)) {
      const rows = await this.runner.record({
        run: () => this.skillRulesSets.listBySkill(skillId),
        item: { skill: ref.name },
        errors,
        buildErrorMessage: (error) =>
          `Failed to read the curated categories of skill "${ref.name}": ${this.runner.messageOf(error)}`,
      });
      state.curatedByName.set(
        ref.name,
        rows === undefined
          ? undefined
          : new Map(rows.map((row) => [row.rulesSetId, row.isElite])),
      );
    }
    const curated = state.curatedByName.get(ref.name);
    if (curated === undefined) {
      return false;
    }
    const curatedIsElite = curated.get(context.rulesSetId);
    if (curatedIsElite === undefined) {
      if (!state.reportedGaps.has(ref.name)) {
        state.reportedGaps.add(ref.name);
        errors.push(
          this.importResults.error({
            item: { skill: ref.name, rulesSet: context.rulesSet },
            message:
              `Skill "${ref.name}" has no curated category for rules set ` +
              `"${context.rulesSet}", so it cannot be recorded as a starting ` +
              'skill there. Curate one in tools/import-manual ' +
              '(data/before-other-importers/skills.json5).',
          }),
        );
      }
      return false;
    }
    if (
      ref.isElite !== undefined &&
      ref.isElite !== curatedIsElite &&
      !state.reportedEliteMismatches.has(ref.name)
    ) {
      state.reportedEliteMismatches.add(ref.name);
      errors.push(
        this.importResults.error({
          item: { skill: ref.name, rulesSet: context.rulesSet },
          message:
            `Skill "${ref.name}" is curated as ` +
            `${curatedIsElite ? 'elite' : 'not elite'} for rules set ` +
            `"${context.rulesSet}", but the source data marks it as ` +
            `${ref.isElite ? 'elite' : 'not elite'}. Correct the curated ` +
            'value in tools/import-manual ' +
            '(data/before-other-importers/skills.json5). The starting skill ' +
            'itself is still recorded -- only the elite marker disagrees.',
        }),
      );
    }
    return true;
  }
}
