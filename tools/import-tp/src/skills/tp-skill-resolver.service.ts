import { ExternalIdResolverService } from '@blood-bowl-tracker/import';
import type { TpSkillMaster } from '@blood-bowl-tracker/parse-tp';
import {
  AnimosityTargetService,
  HatredTargetService,
} from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

/** Hatred's own skillMasterId -- see HatredTargetService. */
export const HATRED_SKILL_MASTER_ID = 307;
/** Animosity's own skillMasterId -- see AnimosityTargetService. */
export const ANIMOSITY_SKILL_MASTER_ID = 269;

/**
 * TP's skillMasterId resolution, shared by every TP importer that names a
 * skill only by that id: the scanned `skillMastersByMasterId` lookup inverted
 * to every id per name, the curated `tourplay.net` external-id fallback for
 * an id no downloaded file names, and the Hatred/Animosity type-3 opaque-code
 * decode. Originally `TpPositionSkillsImportService`'s own private methods,
 * moved here so `TpPlayerSkillsImportService` can reuse the identical
 * resolution without duplicating it.
 */
@Injectable()
export class TpSkillResolverService {
  constructor(
    private readonly hatredTargets: HatredTargetService,
    private readonly animosityTargets: AnimosityTargetService,
    private readonly externalIdResolver: ExternalIdResolverService,
  ) {}

  /**
   * Skill name -> every TP skillMasterId the scan ever saw for it. TP assigns
   * a skill a new id per rules set, so one name routinely has several; each
   * becomes a `tourplay.net` external id on the upserted skill, mirroring how
   * TpPositionsImportService registers every TP position id on one position
   * row (see its `tpPositionIds`/`externalIdsFor`).
   *
   * Built by inverting the whole scanned lookup UP FRONT rather than
   * accumulated while refs are produced: StartingSkillsImportService upserts
   * a name at most once per run, using the FIRST ref it sees for that name,
   * so a set grown ref by ref would register only the ids seen before that
   * ref happened to be built.
   */
  collectSkillMasterIds(
    skillMastersByMasterId: Map<number, TpSkillMaster>,
  ): Map<string, Set<number>> {
    const byName = new Map<string, Set<number>>();
    for (const [skillMasterId, master] of skillMastersByMasterId) {
      let ids = byName.get(master.name);
      if (ids === undefined) {
        ids = new Set();
        byName.set(master.name, ids);
      }
      ids.add(skillMasterId);
    }
    return byName;
  }

  /**
   * Database skill ids for every referenced skillMasterId the scan cannot
   * name, resolved in ONE batched call through the `tourplay.net` external id
   * curated for it in tools/import-manual
   * (data/before-other-importers/skills.json5). An id with no curated
   * external id is simply absent from the result, which is what makes a
   * caller report it unresolved.
   *
   * Depends on that curation phase having already run: a curated id only
   * resolves once `before-other-importers` has upserted the skill it
   * belongs to, which is why that phase runs before this importer.
   */
  async resolveUnnamedMasterIds(options: {
    masterIds: Iterable<number>;
    skillMastersByMasterId: Map<number, TpSkillMaster>;
    tpSystemId: number;
  }): Promise<Map<number, number>> {
    const { masterIds, tpSystemId } = options;
    const ids = [...masterIds];
    const resolved = await this.externalIdResolver.resolveBatch(
      'skill',
      ids.map((masterId) => ({
        externalSystemId: tpSystemId,
        externalId: String(masterId),
      })),
    );
    const skillIdsByMasterId = new Map<number, number>();
    ids.forEach((masterId, index) => {
      const skillId = resolved[index];
      if (skillId !== undefined) {
        skillIdsByMasterId.set(masterId, skillId);
      }
    });
    return skillIdsByMasterId;
  }

  /**
   * The named target for a type-3 opaque code, scoped to the one
   * `skillMasterId` its lookup was confirmed for -- Hatred's own codes never
   * apply to Animosity's table or vice versa.
   */
  decodeTypeThreeTarget(
    skillMasterId: number,
    attributeValue: string,
  ): string | undefined {
    if (skillMasterId === HATRED_SKILL_MASTER_ID) {
      return this.hatredTargets.decode(attributeValue);
    }
    if (skillMasterId === ANIMOSITY_SKILL_MASTER_ID) {
      return this.animosityTargets.decode(attributeValue);
    }
    return undefined;
  }
}
