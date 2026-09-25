import { ExternalIdResolverService } from '@blood-bowl-tracker/import';
import type { TpSkillMaster } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import type { TpKeywordCatalog } from '../keywords/tp-keyword-catalog.service';

/** Hatred's own skillMasterId. */
export const HATRED_SKILL_MASTER_ID = 307;
/** Animosity's own skillMasterId. */
export const ANIMOSITY_SKILL_MASTER_ID = 269;

interface DecodeTypeThreeTargetOptions {
  skillMasterId: number;
  attributeValue: string;
  catalog: TpKeywordCatalog;
}

/**
 * TP's skillMasterId resolution, shared by every TP importer that names a
 * skill only by that id: the scanned `skillMastersByMasterId` lookup inverted
 * to every id per name, the curated `tourplay.net` external-id fallback for
 * an id no downloaded file names, and the Hatred/Animosity type-3 opaque-code
 * decode. This is `TpPlayerSkillsImportService`'s own skill-id resolution;
 * the official team list's starting skills are resolved server-side by
 * `packages/import-tp-live`'s `TpOfficialSkillRefsService` instead.
 */
@Injectable()
export class TpSkillResolverService {
  constructor(private readonly externalIdResolver: ExternalIdResolverService) {}

  /**
   * Skill name -> every TP skillMasterId the scan ever saw for it. TP assigns
   * a skill a new id per rules set, so one name routinely has several; each
   * becomes a `tourplay.net` external id on the upserted skill, mirroring how
   * `packages/import-tp-live`'s `TpOfficialPositionsUpsertService` registers
   * every TP position id on one position row.
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
   * The keyword a Hatred or Animosity starting skill names as its target.
   *
   * TP writes the target as a type-3 attribute value: an opaque numeric
   * keyword code, from the same id space as a position's own keywords. The
   * name comes from the curated catalogue, because TP names these codes
   * nowhere. A code the catalogue does not carry answers `undefined`, which
   * the callers report as an uncurated-code ImportError.
   *
   * Both skills read one catalogue: a target is a keyword, whichever skill
   * names it, so there is no per-skill table any more.
   */
  decodeTypeThreeTarget({
    skillMasterId,
    attributeValue,
    catalog,
  }: DecodeTypeThreeTargetOptions): string | undefined {
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
