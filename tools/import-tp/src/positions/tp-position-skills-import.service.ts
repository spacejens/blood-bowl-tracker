import type {
  ImportError,
  ImportResult,
  StartingSkillRef,
} from '@blood-bowl-tracker/import';
import {
  ExternalSystemBootstrapService,
  ImportResultService,
  StartingSkillsImportService,
} from '@blood-bowl-tracker/import';
import type {
  TpPositionSkillRef,
  TpSkillMaster,
} from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

import type { TpKeywordCatalog } from '../keywords/tp-keyword-catalog.service';
import { TpSkillResolverService } from '../skills/tp-skill-resolver.service';
import { ExternalSystemNameConfigService } from '../source/external-system-name-config.service';

export interface SyncTpPositionSkillsOptions {
  /** positionId -> rulesSetId -> the skill references TP published there. */
  skillRefsByPositionId: Map<number, Map<number, TpPositionSkillRef[]>>;
  /** The skillMasterId -> name + elite marker lookup scanned out of the
   * downloaded mirror. TP's own template file carries neither, so this scan
   * is the only source for both. */
  skillMastersByMasterId: Map<number, TpSkillMaster>;
  /** Every upserted position's DB id -> its name (TpPositionsImportService's
   * positionNamesById), so an unresolvable-skill ImportError can name the
   * position instead of only its bare id. A position missing from this map
   * falls back to `id ${positionId}` rather than throwing. */
  positionNamesById: Map<number, string>;
  /** Rules set id -> its name, so the same ImportErrors can name the rules
   * set instead of only its bare id. A rules set missing from this map falls
   * back to `id ${rulesSetId}`. */
  rulesSetNamesById: Map<number, string>;
  /** The curated keyword catalogue, already loaded once for the whole run,
   * used to decode a Hatred or Animosity type-3 target code. */
  catalog: TpKeywordCatalog;
}

/**
 * Writes each position's starting skills under every rules set TP's official
 * team list publishes it for. Unlike BBL -- one snapshot written to every
 * rules set -- TP's list is per rules set at the source, so nothing is
 * duplicated across rules sets here.
 *
 * TP names a skill only by `skillMasterId`, with any parenthetical value in a
 * separate `attributeValue`; the two are kept apart as a `StartingSkillRef`
 * (name + optional attributeValue) rather than composed into one display
 * string, matching how the schema stores them (see
 * position_rules_set_skills.attributeValue). An id neither the scan nor a
 * curated `tourplay.net` external id can explain
 * is a recorded ImportError naming the position and rules set
 * (by name, not bare id, via `positionNamesById`/`rulesSetNamesById`) --
 * reported once per id, not once per position that uses it -- and its skill
 * is left out rather than failing the position's other skills.
 *
 * TP-local rather than shared: the id lookup and the rules-set resolution
 * feeding it are TP's own. The shared piece is StartingSkillsImportService,
 * which this consumes unchanged.
 *
 * `StartingSkillsImportService.syncStartingSkills` caches its skill-id
 * resolutions, curated-category reads and error-dedup for a single call, so
 * this service accumulates every position's data into one map and calls it
 * exactly once -- never per position or per rules set -- mirroring
 * BblPositionSkillsImportService's precedent.
 *
 * Every skillMasterId the scan CAN name is registered as a `tourplay.net`
 * external id on the upserted skill, exactly as TpPositionsImportService
 * registers every TP position id on one position row. An id no downloaded
 * file ever names is resolved instead through the `tourplay.net` external id
 * curated for it in tools/import-manual -- data, not a hard-coded table.
 */
@Injectable()
export class TpPositionSkillsImportService {
  constructor(
    private readonly startingSkills: StartingSkillsImportService,
    private readonly importResults: ImportResultService,
    private readonly skillResolver: TpSkillResolverService,
    private readonly externalSystemBootstrap: ExternalSystemBootstrapService,
    private readonly externalSystemName: ExternalSystemNameConfigService,
  ) {}

  async syncPositionSkills({
    skillRefsByPositionId,
    skillMastersByMasterId,
    positionNamesById,
    rulesSetNamesById,
    catalog,
  }: SyncTpPositionSkillsOptions): Promise<{ result: ImportResult }> {
    const errors: ImportError[] = [];
    const tpSystemName = this.externalSystemName.getTpSystemName();
    const bootstrap = await this.externalSystemBootstrap.bootstrap([
      { name: tpSystemName, category: 'imported_data_source' },
    ]);
    if (!bootstrap.ok) {
      // Without the TP system id there are no external ids to register and no
      // way to resolve an unnamed id, so nothing is written rather than
      // writing skills that silently lose their TP ids.
      errors.push(bootstrap.error);
      return { result: this.importResults.result({ imported: 0, errors }) };
    }
    const [tpSystemId] = bootstrap.ids;

    const tpSkillMasterIdsByName = this.skillResolver.collectSkillMasterIds(
      skillMastersByMasterId,
    );
    const fallbackSkillIdsByMasterId =
      await this.skillResolver.resolveUnnamedMasterIds({
        masterIds: this.unnamedMasterIds(
          skillRefsByPositionId,
          skillMastersByMasterId,
        ),
        tpSystemId,
      });

    const reportedIds = new Set<number>();
    const reportedAttributeTypeThreeRefs = new Set<string>();
    const skillNamesByPositionId = new Map<
      number,
      Map<number, StartingSkillRef[]>
    >();

    for (const [positionId, refsByRulesSetId] of skillRefsByPositionId) {
      const byRulesSetId = new Map<number, StartingSkillRef[]>();
      for (const [rulesSetId, refs] of refsByRulesSetId) {
        const names = this.resolveNames({
          positionId,
          rulesSetId,
          refs,
          skillMastersByMasterId,
          tpSkillMasterIdsByName,
          fallbackSkillIdsByMasterId,
          tpSystemId,
          positionNamesById,
          rulesSetNamesById,
          reportedIds,
          reportedAttributeTypeThreeRefs,
          errors,
          catalog,
        });
        if (names.length > 0) {
          byRulesSetId.set(rulesSetId, names);
        }
      }
      if (byRulesSetId.size > 0) {
        skillNamesByPositionId.set(positionId, byRulesSetId);
      }
    }

    const imported = await this.startingSkills.syncStartingSkills(
      skillNamesByPositionId,
      rulesSetNamesById,
      errors,
    );
    return { result: this.importResults.result({ imported, errors }) };
  }

  /**
   * Every referenced skillMasterId across every position and rules set that
   * the scan cannot name, for `TpSkillResolverService.resolveUnnamedMasterIds`
   * to resolve in one batched call.
   */
  private unnamedMasterIds(
    skillRefsByPositionId: Map<number, Map<number, TpPositionSkillRef[]>>,
    skillMastersByMasterId: Map<number, TpSkillMaster>,
  ): Set<number> {
    const unnamed = new Set<number>();
    for (const refsByRulesSetId of skillRefsByPositionId.values()) {
      for (const refs of refsByRulesSetId.values()) {
        for (const ref of refs) {
          if (
            !('name' in ref) &&
            !skillMastersByMasterId.has(ref.skillMasterId)
          ) {
            unnamed.add(ref.skillMasterId);
          }
        }
      }
    }
    return unnamed;
  }

  /**
   * Resolve one (position, rules set)'s raw skill references into
   * `StartingSkillRef`s (name kept separate from any attribute value) and
   * record an ImportError -- once per skillMasterId across the whole run --
   * for any id neither the scan nor a curated `tourplay.net` external id can
   * explain. A reference whose attribute is TP's type 3 (an opaque numeric
   * code, not a composable value -- see `TpPositionSkillRef`) is likewise
   * recorded as an ImportError and left out, once per distinct
   * (skillMasterId, attributeValue) pair across the whole run. A type-3 code
   * the curated keyword catalogue CAN explain (a Hatred or Animosity
   * target -- see docs/import-tp/keyword-target-decoding.md) is composed
   * normally instead, with the named target as its attribute value.
   *
   * A reference TP named directly rather than by id (a star's own
   * `specialRuleName`) needs no lookup at all and is passed straight
   * through as its own `StartingSkillRef`, with no TP id to register.
   */
  private resolveNames(options: {
    positionId: number;
    rulesSetId: number;
    refs: TpPositionSkillRef[];
    skillMastersByMasterId: Map<number, TpSkillMaster>;
    tpSkillMasterIdsByName: Map<string, Set<number>>;
    fallbackSkillIdsByMasterId: Map<number, number>;
    tpSystemId: number;
    positionNamesById: Map<number, string>;
    rulesSetNamesById: Map<number, string>;
    reportedIds: Set<number>;
    reportedAttributeTypeThreeRefs: Set<string>;
    errors: ImportError[];
    catalog: TpKeywordCatalog;
  }): StartingSkillRef[] {
    const {
      positionId,
      rulesSetId,
      refs,
      skillMastersByMasterId,
      tpSkillMasterIdsByName,
      fallbackSkillIdsByMasterId,
      tpSystemId,
      positionNamesById,
      rulesSetNamesById,
      reportedIds,
      reportedAttributeTypeThreeRefs,
      errors,
      catalog,
    } = options;
    const positionName =
      positionNamesById.get(positionId) ?? `id ${positionId}`;
    const rulesSetName =
      rulesSetNamesById.get(rulesSetId) ?? `id ${rulesSetId}`;
    const names: StartingSkillRef[] = [];
    for (const ref of refs) {
      if ('name' in ref) {
        // TP named this skill directly (a star's own specialRuleName), so
        // there is no id to look up, no attribute value to compose and no TP
        // external id to register. Its curated `unique` category is what
        // marks it exclusive downstream. specialRuleName carries no elite
        // marker of its own -- `false` matches the convention a source with
        // no concept of eliteness uses.
        names.push({ name: ref.name, isElite: false });
        continue;
      }
      const resolved = this.resolveSkill({
        skillMasterId: ref.skillMasterId,
        skillMastersByMasterId,
        tpSkillMasterIdsByName,
        fallbackSkillIdsByMasterId,
        tpSystemId,
      });
      if (resolved === undefined) {
        if (!reportedIds.has(ref.skillMasterId)) {
          reportedIds.add(ref.skillMasterId);
          errors.push(
            this.importResults.error({
              item: { position: positionId, skillMasterId: ref.skillMasterId },
              message:
                `Could not resolve TP skill ${ref.skillMasterId} (first ` +
                `seen on position "${positionName}", rules set ` +
                `"${rulesSetName}"): no downloaded roster or match file ` +
                'names it and no skill is curated with it as a tourplay.net ' +
                "external id, so it is left out of that position's starting " +
                'skills. Curate one in tools/import-manual ' +
                '(data/before-other-importers/skills.json5).',
            }),
          );
        }
        continue;
      }
      const { name } = resolved;
      if (ref.attributeType === 3) {
        const target =
          ref.attributeValue === undefined
            ? undefined
            : this.skillResolver.decodeTypeThreeTarget({
                skillMasterId: ref.skillMasterId,
                attributeValue: ref.attributeValue,
                catalog,
              });
        if (target !== undefined) {
          names.push({ ...resolved, attributeValue: target });
          continue;
        }
        const key = `${ref.skillMasterId}:${ref.attributeValue}`;
        if (!reportedAttributeTypeThreeRefs.has(key)) {
          reportedAttributeTypeThreeRefs.add(key);
          errors.push(
            this.importResults.error({
              item: {
                position: positionId,
                skillMasterId: ref.skillMasterId,
                attributeValue: ref.attributeValue,
              },
              message:
                `TP skill ${ref.skillMasterId} (${name}) on position ` +
                `"${positionName}" names keyword code ` +
                `"${ref.attributeValue}" as its target, and no curated ` +
                'keyword carries that code, so it is left out of that ' +
                "position's starting skills. Curate it in " +
                'tools/import-manual (data/before-other-importers/keywords.json5).',
            }),
          );
        }
        continue;
      }
      names.push(
        ref.attributeValue === undefined
          ? resolved
          : { ...resolved, attributeValue: ref.attributeValue },
      );
    }
    return names;
  }

  /**
   * The base `StartingSkillRef` a raw skillMasterId resolves to.
   *
   * The scanned lookup answers first, and the ref then carries EVERY TP id
   * ever seen for that name as `tourplay.net` external ids, so the skill
   * self-registers them at ordinary upsert time -- no curation needed.
   *
   * Otherwise the id is one no downloaded file ever names, and a curated
   * `tourplay.net` external id has already resolved it to a database skill
   * id; that id goes through as `skillId`, which makes the shared pipeline
   * skip its upsert-by-name step entirely. The name is synthetic there
   * BECAUSE the resolve answers with an id and never a name: it is only a
   * per-run cache key and an error-message token, and (since `skillId` is
   * set) it never reaches the database. Such an id carries no eliteness
   * signal of its own -- `false` matches the convention a source with no
   * concept of eliteness uses.
   */
  private resolveSkill(options: {
    skillMasterId: number;
    skillMastersByMasterId: Map<number, TpSkillMaster>;
    tpSkillMasterIdsByName: Map<string, Set<number>>;
    fallbackSkillIdsByMasterId: Map<number, number>;
    tpSystemId: number;
  }): StartingSkillRef | undefined {
    const {
      skillMasterId,
      skillMastersByMasterId,
      tpSkillMasterIdsByName,
      fallbackSkillIdsByMasterId,
      tpSystemId,
    } = options;
    const master = skillMastersByMasterId.get(skillMasterId);
    if (master !== undefined) {
      return {
        name: master.name,
        isElite: master.isElite,
        externalIds: [...(tpSkillMasterIdsByName.get(master.name) ?? [])].map(
          (id) => ({ externalSystemId: tpSystemId, externalId: String(id) }),
        ),
      };
    }
    const skillId = fallbackSkillIdsByMasterId.get(skillMasterId);
    if (skillId === undefined) {
      return undefined;
    }
    return { name: `TP skill ${skillMasterId}`, isElite: false, skillId };
  }
}
