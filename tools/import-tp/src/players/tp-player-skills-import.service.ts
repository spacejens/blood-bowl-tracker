import type { PlayerSkillEntry } from '@blood-bowl-tracker/api-contract';
import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  NAME_EXTERNAL_SYSTEM,
  NameExternalIdService,
  PlayerSkillsImportService,
  SkillsImportService,
} from '@blood-bowl-tracker/import';
import type {
  TpPlayerSkillRef,
  TpPlayerSkills,
  TpSkillMaster,
} from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import type { TpKeywordCatalog } from '../keywords/tp-keyword-catalog.service';
import { TpSkillResolverService } from '../skills/tp-skill-resolver.service';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';

/**
 * Writes every roster player's own skills, starting and gained alike.
 *
 * TP's split is exact where BBL's is not: a `lineUpMaster.skills` entry is the
 * position template's, so `starting`; a player's own `skills` entry carries
 * `isRandom`, which maps straight onto `random` vs. `chosen`. `advancementOrder`
 * is the 1-based index within that array -- TP's own presentation order, the
 * best proxy for a sequence it exposes.
 *
 * A player with no skill group at all (a match-embedded-only, departed player)
 * contributes nothing: their only surviving data is a flat list of bare
 * skillMasterIds with no starting/gained split, no `isRandom` and no attribute
 * values, and importing that would record a knowingly incomplete picture --
 * such a player is simply absent from `skillsByPlayerId`, which
 * `TpRosterPlayerFactsService` builds.
 *
 * TP-local rather than shared because the id resolution is TP's own; the
 * shared piece is `PlayerSkillsImportService`, consumed unchanged and called
 * exactly once for the whole run.
 */
@Injectable()
export class TpPlayerSkillsImportService {
  constructor(
    private readonly skillsImport: SkillsImportService,
    private readonly playerSkills: PlayerSkillsImportService,
    private readonly skillResolver: TpSkillResolverService,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
    private readonly nameExternalId: NameExternalIdService,
    private readonly importResults: ImportResultService,
  ) {}

  async syncPlayerSkills(options: {
    skillsByPlayerId: Map<number, TpPlayerSkills>;
    skillMastersByMasterId: Map<number, TpSkillMaster>;
    /** The curated keyword catalogue, already loaded once for the whole run,
     * used to decode a Hatred or Animosity type-3 target code. */
    catalog: TpKeywordCatalog;
  }): Promise<{ result: ImportResult }> {
    const { skillsByPlayerId, skillMastersByMasterId, catalog } = options;
    const errors: ImportError[] = [];
    if (skillsByPlayerId.size === 0) {
      return { result: this.importResults.result({ imported: 0, errors }) };
    }

    const tpSystemName = this.externalSystemName.getTpSystemName();
    const bootstrap = await this.externalSystemBootstrap.bootstrap([
      { name: tpSystemName, category: 'imported_data_source' },
      NAME_EXTERNAL_SYSTEM,
    ]);
    if (!bootstrap.ok) {
      // Without the TP id there are no external ids to register and no way
      // to resolve an unnamed id, so nothing is written rather than writing
      // skills that silently lose their TP ids.
      errors.push(bootstrap.error);
      return { result: this.importResults.result({ imported: 0, errors }) };
    }
    const [tpSystemId, nameSystemId] = bootstrap.ids;

    // Built once up front, exactly as `packages/import-tp-live`'s
    // `TpOfficialSkillRefsService` does for the official team list's starting
    // skills: a skill upserted by name registers EVERY TP id ever seen for
    // it, which a set grown ref by ref would miss for any id seen after the
    // first upsert.
    const tpSkillMasterIdsByName = this.skillResolver.collectSkillMasterIds(
      skillMastersByMasterId,
    );
    const fallbackSkillIdsByMasterId =
      await this.skillResolver.resolveUnnamedMasterIds({
        masterIds: this.unnamedMasterIds(
          skillsByPlayerId,
          skillMastersByMasterId,
        ),
        tpSystemId,
      });

    /** Skill name -> its database id, or undefined when its upsert failed. */
    const skillIdsByName = new Map<string, number | undefined>();
    const reportedIds = new Set<number>();
    const reportedAttributeTypeThreeRefs = new Set<string>();
    const entries: PlayerSkillEntry[] = [];

    for (const [playerId, skills] of skillsByPlayerId) {
      for (const ref of skills.starting) {
        const entry = await this.buildEntry({
          playerId,
          ref,
          source: 'starting',
          skillMastersByMasterId,
          tpSkillMasterIdsByName,
          fallbackSkillIdsByMasterId,
          tpSystemId,
          nameSystemId,
          skillIdsByName,
          reportedIds,
          reportedAttributeTypeThreeRefs,
          errors,
          catalog,
        });
        if (entry !== undefined) {
          entries.push(entry);
        }
      }
      for (const [index, ref] of skills.gained.entries()) {
        const entry = await this.buildEntry({
          playerId,
          ref,
          source: ref.isRandom ? 'random' : 'chosen',
          advancementOrder: index + 1,
          skillMastersByMasterId,
          tpSkillMasterIdsByName,
          fallbackSkillIdsByMasterId,
          tpSystemId,
          nameSystemId,
          skillIdsByName,
          reportedIds,
          reportedAttributeTypeThreeRefs,
          errors,
          catalog,
        });
        if (entry !== undefined) {
          entries.push(entry);
        }
      }
    }

    const imported = await this.playerSkills.syncPlayerSkills(entries, errors);
    return { result: this.importResults.result({ imported, errors }) };
  }

  /**
   * Every referenced skillMasterId across every player's starting and gained
   * lists that the scan cannot name, for
   * `TpSkillResolverService.resolveUnnamedMasterIds` to resolve in one
   * batched call.
   */
  private unnamedMasterIds(
    skillsByPlayerId: Map<number, TpPlayerSkills>,
    skillMastersByMasterId: Map<number, TpSkillMaster>,
  ): Set<number> {
    const unnamed = new Set<number>();
    for (const skills of skillsByPlayerId.values()) {
      for (const ref of [...skills.starting, ...skills.gained]) {
        if (!skillMastersByMasterId.has(ref.skillMasterId)) {
          unnamed.add(ref.skillMasterId);
        }
      }
    }
    return unnamed;
  }

  /**
   * One `PlayerSkillEntry` for one raw reference, or `undefined` when the
   * skillMasterId cannot be resolved to a database skill id at all, or when
   * its attribute is an unresolvable type-3 opaque code -- either drops the
   * skill entirely, recording an ImportError once per distinct id (or
   * (skillMasterId, attributeValue) pair) across the whole run, the same
   * do-not-repeat-a-known-gap convention `packages/import-tp-live`'s
   * `TpOfficialSkillRefsService` follows for the official team list's
   * starting skills.
   */
  private async buildEntry(options: {
    playerId: number;
    ref: TpPlayerSkillRef;
    source: 'starting' | 'chosen' | 'random';
    advancementOrder?: number;
    skillMastersByMasterId: Map<number, TpSkillMaster>;
    tpSkillMasterIdsByName: Map<string, Set<number>>;
    fallbackSkillIdsByMasterId: Map<number, number>;
    tpSystemId: number;
    nameSystemId: number;
    skillIdsByName: Map<string, number | undefined>;
    reportedIds: Set<number>;
    reportedAttributeTypeThreeRefs: Set<string>;
    errors: ImportError[];
    catalog: TpKeywordCatalog;
  }): Promise<PlayerSkillEntry | undefined> {
    const {
      playerId,
      ref,
      source,
      advancementOrder,
      skillMastersByMasterId,
      tpSkillMasterIdsByName,
      fallbackSkillIdsByMasterId,
      tpSystemId,
      nameSystemId,
      skillIdsByName,
      reportedIds,
      reportedAttributeTypeThreeRefs,
      errors,
      catalog,
    } = options;
    const master = skillMastersByMasterId.get(ref.skillMasterId);
    const skillId = await this.resolveSkillId({
      ref,
      master,
      tpSkillMasterIdsByName,
      fallbackSkillIdsByMasterId,
      tpSystemId,
      nameSystemId,
      skillIdsByName,
      errors,
    });
    if (skillId === undefined) {
      if (!reportedIds.has(ref.skillMasterId)) {
        reportedIds.add(ref.skillMasterId);
        errors.push(
          this.importResults.error({
            item: { skillMasterId: ref.skillMasterId },
            message:
              `Could not resolve TP skill ${ref.skillMasterId}: no ` +
              'downloaded roster or match file names it and no skill is ' +
              'curated with it as a tourplay.net external id, so it is ' +
              "left out of that player's skills. Curate one in " +
              'tools/import-manual (data/before-other-importers/skills.json5).',
          }),
        );
      }
      return undefined;
    }

    const name = master?.name ?? `TP skill ${ref.skillMasterId}`;
    const attribute = this.attributeValue({
      skillMasterId: ref.skillMasterId,
      name,
      ref,
      reportedAttributeTypeThreeRefs,
      errors,
      catalog,
    });
    if (attribute === undefined) {
      return undefined;
    }

    return {
      playerId,
      skillId,
      source,
      attributeValue: attribute.value,
      ...(advancementOrder === undefined ? {} : { advancementOrder }),
    };
  }

  /**
   * One skill's database id, upserted at most once per run (cached by name,
   * the same way `StartingSkillsImportService`/`BblPlayerSkillsImportService`
   * cache theirs) -- a name resolved from two different scanned
   * skillMasterIds must not upsert twice.
   *
   * An id the scan cannot name resolves instead through the curated
   * `tourplay.net` external id `TpSkillResolverService.resolveUnnamedMasterIds`
   * already batched for the whole run; that id needs no upsert of its own.
   */
  private async resolveSkillId(options: {
    ref: TpPlayerSkillRef;
    master: TpSkillMaster | undefined;
    tpSkillMasterIdsByName: Map<string, Set<number>>;
    fallbackSkillIdsByMasterId: Map<number, number>;
    tpSystemId: number;
    nameSystemId: number;
    skillIdsByName: Map<string, number | undefined>;
    errors: ImportError[];
  }): Promise<number | undefined> {
    const {
      ref,
      master,
      tpSkillMasterIdsByName,
      fallbackSkillIdsByMasterId,
      tpSystemId,
      nameSystemId,
      skillIdsByName,
      errors,
    } = options;
    if (master === undefined) {
      return fallbackSkillIdsByMasterId.get(ref.skillMasterId);
    }
    const { name } = master;
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
          ...[...(tpSkillMasterIdsByName.get(name) ?? [])].map((id) => ({
            externalSystemId: tpSystemId,
            externalId: String(id),
          })),
        ],
      },
      errors,
    );
    // A failed upsert already recorded its own error; caching undefined
    // keeps it from being retried (and re-reported) for every other player.
    const id = upserted?.id;
    skillIdsByName.set(name, id);
    return id;
  }

  /**
   * The attribute value one reference contributes, or `undefined` for none.
   * Types 0-2 are directly composable; type 3 is a keyword code, decoded
   * through the curated keyword catalogue and, when the catalogue does not
   * carry it, the whole skill is left out with one ImportError per distinct
   * (skillMasterId, value) pair across the run -- the same convention
   * `packages/import-tp-live`'s `TpOfficialSkillRefsService` follows for the
   * official team list's starting skills (see
   * docs/import-tp/keyword-target-decoding.md).
   */
  private attributeValue(options: {
    skillMasterId: number;
    name: string;
    ref: TpPlayerSkillRef;
    reportedAttributeTypeThreeRefs: Set<string>;
    errors: ImportError[];
    catalog: TpKeywordCatalog;
  }): { value: string | null } | undefined {
    const {
      skillMasterId,
      name,
      ref,
      reportedAttributeTypeThreeRefs,
      errors,
      catalog,
    } = options;
    if (ref.attributeValue === undefined) {
      return { value: null };
    }
    if (ref.attributeType === 3) {
      const target = this.skillResolver.decodeTypeThreeTarget({
        skillMasterId,
        attributeValue: ref.attributeValue,
        catalog,
      });
      if (target !== undefined) {
        return { value: target };
      }
      const key = `${skillMasterId}:${ref.attributeValue}`;
      if (!reportedAttributeTypeThreeRefs.has(key)) {
        reportedAttributeTypeThreeRefs.add(key);
        errors.push(
          this.importResults.error({
            item: { skillMasterId, attributeValue: ref.attributeValue },
            message:
              `TP skill ${skillMasterId} (${name}) names keyword code ` +
              `"${ref.attributeValue}" as its target, and no curated ` +
              'keyword carries that code, so it is left out of that ' +
              "player's skills. Curate it in tools/import-manual " +
              '(data/before-other-importers/keywords.json5).',
          }),
        );
      }
      return undefined;
    }
    return { value: ref.attributeValue };
  }
}
