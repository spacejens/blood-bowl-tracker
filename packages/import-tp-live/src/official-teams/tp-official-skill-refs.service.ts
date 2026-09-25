import type {
  ExternalId,
  ImportError,
  TpSkillMasterName,
} from '@blood-bowl-tracker/api-contract';
import { SkillsService } from '@blood-bowl-tracker/game-data';
import type { TpPositionSkillRef } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import { TpImportResultsService } from '../tp-import-results.service';
import { TpUpsertRunnerService } from '../tp-upsert-runner.service';
import type { TpOfficialKeywordCatalog } from './tp-official-keyword-catalog.service';
import type { TpOfficialPositionSlot } from './tp-official-positions-upsert.service';
import type { TpOfficialTeamsContext } from './tp-official-teams-context.service';

/** Hatred's own skillMasterId. */
export const HATRED_SKILL_MASTER_ID = 307;
/** Animosity's own skillMasterId. */
export const ANIMOSITY_SKILL_MASTER_ID = 269;

/**
 * One starting skill, ready to write: its bare name (its identity) kept apart
 * from any position-specific attribute value ("4+" for Loner).
 */
export interface TpStartingSkillRef {
  name: string;
  attributeValue?: string;
  /**
   * Whether the source marks the skill elite; undefined when it says
   * nothing, which skips the cross-check against the curated value.
   */
  isElite?: boolean;
  /** Extra external ids to register when the skill is upserted by name. */
  externalIds?: ExternalId[];
  /**
   * A skill already resolved by its TP external id. When set, no upsert by
   * name happens, and `name` is only a cache key and message token.
   */
  skillId?: number;
}

/** Options for {@link TpOfficialSkillRefsService.resolve}. */
export interface ResolveOfficialSkillRefsOptions {
  slots: TpOfficialPositionSlot[];
  /** Names the caller supplied for skillMasterIds; may be empty. */
  skillMasters: TpSkillMasterName[];
  catalog: TpOfficialKeywordCatalog;
  context: TpOfficialTeamsContext;
  errors: ImportError[];
}

interface SkillLookups {
  mastersById: Map<number, TpSkillMasterName>;
  /** Every supplied TP id per skill name: TP gives a skill a new id per rules set. */
  masterIdsByName: Map<string, Set<number>>;
  /** skillMasterId -> skill id, for ids with no supplied name. */
  registeredSkillIds: Map<number, number>;
}

/** What has already been reported this call, so each gap is reported once. */
interface Reported {
  masterIds: Set<number>;
  typeThreeRefs: Set<string>;
}

@Injectable()
export class TpOfficialSkillRefsService {
  constructor(
    private readonly skills: SkillsService,
    private readonly importResults: TpImportResultsService,
    private readonly runner: TpUpsertRunnerService,
  ) {}

  /**
   * Each position's starting skills, resolved from TP's references. TP names
   * a skill only by `skillMasterId` (a star's own special rule excepted,
   * which arrives by name and passes straight through). An id with a
   * supplied name becomes a named ref carrying every TP id supplied for that
   * name, so the skill registers them all when upserted. Any other id is
   * resolved, in one batch, through a skill already carrying it as a TP
   * external id -- registered by an earlier roster, match or bulk import, or
   * curated in tools/import-manual. An id neither way explains is reported
   * once and left out; the position's other skills are kept.
   *
   * A type-3 attribute is an opaque keyword code, not a value to show: for
   * Hatred and Animosity it is decoded through the curated keyword
   * catalogue into the target's name; otherwise (or when uncurated) the
   * skill is reported once per (skill, code) and left out.
   */
  async resolve(
    options: ResolveOfficialSkillRefsOptions,
  ): Promise<Map<number, TpStartingSkillRef[]>> {
    const { slots, skillMasters, context, errors } = options;
    const mastersById = new Map(
      skillMasters.map((master) => [master.skillMasterId, master]),
    );
    const masterIdsByName = new Map<string, Set<number>>();
    for (const master of skillMasters) {
      let ids = masterIdsByName.get(master.name);
      if (ids === undefined) {
        ids = new Set();
        masterIdsByName.set(master.name, ids);
      }
      ids.add(master.skillMasterId);
    }
    const lookups: SkillLookups = {
      mastersById,
      masterIdsByName,
      registeredSkillIds: await this.resolveRegistered({
        masterIds: this.unnamedMasterIds(slots, mastersById),
        context,
        errors,
      }),
    };
    const reported: Reported = {
      masterIds: new Set(),
      typeThreeRefs: new Set(),
    };

    const refsByPositionId = new Map<number, TpStartingSkillRef[]>();
    for (const slot of slots) {
      const refs: TpStartingSkillRef[] = [];
      for (const ref of slot.skills) {
        const resolved = this.resolveRef({
          ref,
          slot,
          lookups,
          reported,
          options,
        });
        if (resolved !== undefined) {
          refs.push(resolved);
        }
      }
      if (refs.length > 0) {
        refsByPositionId.set(slot.positionId, refs);
      }
    }
    return refsByPositionId;
  }

  /** Every referenced id with no supplied name, in first-seen order. */
  private unnamedMasterIds(
    slots: TpOfficialPositionSlot[],
    mastersById: Map<number, TpSkillMasterName>,
  ): number[] {
    const ids = new Set<number>();
    for (const slot of slots) {
      for (const ref of slot.skills) {
        if ('skillMasterId' in ref && !mastersById.has(ref.skillMasterId)) {
          ids.add(ref.skillMasterId);
        }
      }
    }
    return [...ids];
  }

  /** skillMasterId -> skill id for every id a skill carries as a TP external id. */
  private async resolveRegistered(options: {
    masterIds: number[];
    context: TpOfficialTeamsContext;
    errors: ImportError[];
  }): Promise<Map<number, number>> {
    const { masterIds, context, errors } = options;
    const skillIds = new Map<number, number>();
    if (masterIds.length === 0) {
      return skillIds;
    }
    const results = await this.runner.record({
      run: () =>
        this.skills.resolveBatch(
          masterIds.map((id) => ({
            externalSystemId: context.tpSystemId,
            externalId: String(id),
          })),
        ),
      item: { skillMasterIds: masterIds },
      errors,
      buildErrorMessage: (error) =>
        `Failed to resolve TP skill ids by external id: ${this.runner.messageOf(error)}`,
    });
    masterIds.forEach((masterId, index) => {
      const result = results?.[index];
      if (result !== undefined && result.found) {
        skillIds.set(masterId, result.id);
      }
    });
    return skillIds;
  }

  /** One raw reference as a starting-skill ref, or undefined (reported) when it cannot be. */
  private resolveRef(args: {
    ref: TpPositionSkillRef;
    slot: TpOfficialPositionSlot;
    lookups: SkillLookups;
    reported: Reported;
    options: ResolveOfficialSkillRefsOptions;
  }): TpStartingSkillRef | undefined {
    const { ref, slot, lookups, reported, options } = args;
    const { catalog, context, errors } = options;
    if ('name' in ref) {
      return { name: ref.name };
    }
    const base = this.baseRef(ref.skillMasterId, lookups, context);
    if (base === undefined) {
      if (!reported.masterIds.has(ref.skillMasterId)) {
        reported.masterIds.add(ref.skillMasterId);
        errors.push(
          this.importResults.error({
            item: {
              position: slot.positionId,
              skillMasterId: ref.skillMasterId,
            },
            message:
              `Could not resolve TP skill ${ref.skillMasterId} (first seen on ` +
              `position "${slot.name}", rules set "${context.rulesSet}"): no ` +
              'name was supplied for it and no skill carries it as a TP ' +
              "external id, so it is left out of that position's starting " +
              'skills. Import a roster or match that names it, or curate it ' +
              'in tools/import-manual (data/before-other-importers/skills.json5).',
          }),
        );
      }
      return undefined;
    }
    if (ref.attributeType === 3) {
      const target =
        ref.attributeValue === undefined
          ? undefined
          : this.decodeTypeThreeTarget(
              ref.skillMasterId,
              ref.attributeValue,
              catalog,
            );
      if (target !== undefined) {
        return { ...base, attributeValue: target };
      }
      const key = `${ref.skillMasterId}:${ref.attributeValue}`;
      if (!reported.typeThreeRefs.has(key)) {
        reported.typeThreeRefs.add(key);
        errors.push(
          this.importResults.error({
            item: {
              position: slot.positionId,
              skillMasterId: ref.skillMasterId,
              attributeValue: ref.attributeValue,
            },
            message:
              `TP skill ${ref.skillMasterId} (${base.name}) on position ` +
              `"${slot.name}" names keyword code "${ref.attributeValue}" as ` +
              'its target, and no curated keyword carries that code, so it ' +
              "is left out of that position's starting skills. Curate it in " +
              'tools/import-manual (data/before-other-importers/keywords.json5).',
          }),
        );
      }
      return undefined;
    }
    return ref.attributeValue === undefined
      ? base
      : { ...base, attributeValue: ref.attributeValue };
  }

  /** The ref a skillMasterId resolves to, before any attribute value. */
  private baseRef(
    skillMasterId: number,
    lookups: SkillLookups,
    context: TpOfficialTeamsContext,
  ): TpStartingSkillRef | undefined {
    const master = lookups.mastersById.get(skillMasterId);
    if (master !== undefined) {
      return {
        name: master.name,
        isElite: master.isElite,
        externalIds: [...(lookups.masterIdsByName.get(master.name) ?? [])].map(
          (id) => ({
            externalSystemId: context.tpSystemId,
            externalId: String(id),
          }),
        ),
      };
    }
    const skillId = lookups.registeredSkillIds.get(skillMasterId);
    return skillId === undefined
      ? undefined
      : { name: `TP skill ${skillMasterId}`, skillId };
  }

  /**
   * The keyword a Hatred or Animosity skill names as its target: TP writes it
   * as an opaque numeric keyword code, named only by the curated catalogue.
   * Undefined for any other skill, a non-numeric value or an uncurated code.
   */
  private decodeTypeThreeTarget(
    skillMasterId: number,
    attributeValue: string,
    catalog: TpOfficialKeywordCatalog,
  ): string | undefined {
    if (
      skillMasterId !== HATRED_SKILL_MASTER_ID &&
      skillMasterId !== ANIMOSITY_SKILL_MASTER_ID
    ) {
      return undefined;
    }
    const code = Number(attributeValue);
    if (!Number.isInteger(code)) {
      return undefined;
    }
    return catalog.byCode.get(code)?.name;
  }
}
