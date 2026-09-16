import type {
  ImportError,
  ImportResult,
  StartingSkillRef,
} from '@blood-bowl-tracker/import';
import {
  ImportResultService,
  StartingSkillsImportService,
} from '@blood-bowl-tracker/import';
import type { TpPositionSkillRef } from '@blood-bowl-tracker/parse-tp';
import { Injectable } from '@nestjs/common';

export interface SyncTpPositionSkillsOptions {
  /** positionId -> rulesSetId -> the skill references TP published there. */
  skillRefsByPositionId: Map<number, Map<number, TpPositionSkillRef[]>>;
  /** The skillMasterId -> name lookup scanned out of the downloaded mirror. */
  skillNamesByMasterId: Map<number, string>;
  /** Every upserted position's DB id -> its name (TpPositionsImportService's
   * positionNamesById), so an unresolvable-skill ImportError can name the
   * position instead of only its bare id. A position missing from this map
   * falls back to `id ${positionId}` rather than throwing. */
  positionNamesById: Map<number, string>;
  /** Rules set id -> its name, so the same ImportErrors can name the rules
   * set instead of only its bare id. A rules set missing from this map falls
   * back to `id ${rulesSetId}`. */
  rulesSetNamesById: Map<number, string>;
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
 * position_rules_set_skills.attributeValue). An id the lookup cannot explain
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
 */
@Injectable()
export class TpPositionSkillsImportService {
  constructor(
    private readonly startingSkills: StartingSkillsImportService,
    private readonly importResults: ImportResultService,
  ) {}

  async syncPositionSkills({
    skillRefsByPositionId,
    skillNamesByMasterId,
    positionNamesById,
    rulesSetNamesById,
  }: SyncTpPositionSkillsOptions): Promise<{ result: ImportResult }> {
    const errors: ImportError[] = [];
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
          skillNamesByMasterId,
          positionNamesById,
          rulesSetNamesById,
          reportedIds,
          reportedAttributeTypeThreeRefs,
          errors,
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
   * Resolve one (position, rules set)'s raw skill references into
   * `StartingSkillRef`s (name kept separate from any attribute value) and
   * record an ImportError -- once per skillMasterId across the whole run --
   * for any id the lookup cannot explain. A reference whose attribute is TP's
   * type 3 (an opaque numeric code, not a composable value -- see
   * `TpPositionSkillRef`) is likewise recorded as an ImportError and left
   * out, once per distinct (skillMasterId, attributeValue) pair across the
   * whole run.
   */
  private resolveNames(options: {
    positionId: number;
    rulesSetId: number;
    refs: TpPositionSkillRef[];
    skillNamesByMasterId: Map<number, string>;
    positionNamesById: Map<number, string>;
    rulesSetNamesById: Map<number, string>;
    reportedIds: Set<number>;
    reportedAttributeTypeThreeRefs: Set<string>;
    errors: ImportError[];
  }): StartingSkillRef[] {
    const {
      positionId,
      rulesSetId,
      refs,
      skillNamesByMasterId,
      positionNamesById,
      rulesSetNamesById,
      reportedIds,
      reportedAttributeTypeThreeRefs,
      errors,
    } = options;
    const positionName =
      positionNamesById.get(positionId) ?? `id ${positionId}`;
    const rulesSetName =
      rulesSetNamesById.get(rulesSetId) ?? `id ${rulesSetId}`;
    const names: StartingSkillRef[] = [];
    for (const ref of refs) {
      const name = skillNamesByMasterId.get(ref.skillMasterId);
      if (name === undefined) {
        if (!reportedIds.has(ref.skillMasterId)) {
          reportedIds.add(ref.skillMasterId);
          errors.push(
            this.importResults.error({
              item: { position: positionId, skillMasterId: ref.skillMasterId },
              message:
                `Could not resolve TP skill ${ref.skillMasterId} (first ` +
                `seen on position "${positionName}", rules set ` +
                `"${rulesSetName}"): no downloaded roster or match file ` +
                "names it, so it is left out of that position's starting " +
                'skills.',
            }),
          );
        }
        continue;
      }
      if (ref.attributeType === 3) {
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
                `"${positionName}" carries an attribute value of ` +
                `"${ref.attributeValue}" as an unresolvable type-3 opaque ` +
                'code, not a normal composable value: TP resolves that ' +
                'code via a lookup this package does not have, so it is ' +
                "left out of that position's starting skills rather than " +
                'composed as-is.',
            }),
          );
        }
        continue;
      }
      // TODO(next task): supply TP's real isElite marker from the skill-master
      // scan. Hardcoded false keeps the build green until then.
      names.push(
        ref.attributeValue === undefined
          ? { name, isElite: false }
          : { name, attributeValue: ref.attributeValue, isElite: false },
      );
    }
    return names;
  }
}
