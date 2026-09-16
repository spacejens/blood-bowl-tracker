import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
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
}

/**
 * Writes each position's starting skills under every rules set TP's official
 * team list publishes it for. Unlike BBL -- one snapshot written to every
 * rules set -- TP's list is per rules set at the source, so nothing is
 * duplicated across rules sets here.
 *
 * TP names a skill only by `skillMasterId`, with any parenthetical value in a
 * separate `attributeValue`; the two are recomposed into the one display name
 * every source and the curated files share (`Loner (4+)`). An id the lookup
 * cannot explain is a recorded ImportError naming the position and the id --
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
  }: SyncTpPositionSkillsOptions): Promise<{ result: ImportResult }> {
    const errors: ImportError[] = [];
    const reportedIds = new Set<number>();
    const skillNamesByPositionId = new Map<number, Map<number, string[]>>();

    for (const [positionId, refsByRulesSetId] of skillRefsByPositionId) {
      const byRulesSetId = new Map<number, string[]>();
      for (const [rulesSetId, refs] of refsByRulesSetId) {
        const names = this.resolveNames({
          positionId,
          refs,
          skillNamesByMasterId,
          reportedIds,
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
      errors,
    );
    return { result: this.importResults.result({ imported, errors }) };
  }

  /**
   * Resolve one (position, rules set)'s raw skill references into display
   * names, composing any attribute value into the name and recording an
   * ImportError -- once per skillMasterId across the whole run -- for any id
   * the lookup cannot explain.
   */
  private resolveNames(options: {
    positionId: number;
    refs: TpPositionSkillRef[];
    skillNamesByMasterId: Map<number, string>;
    reportedIds: Set<number>;
    errors: ImportError[];
  }): string[] {
    const { positionId, refs, skillNamesByMasterId, reportedIds, errors } =
      options;
    const names: string[] = [];
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
                `seen on position ${positionId}): no downloaded roster or ` +
                'match file names it, so it is left out of that ' +
                "position's starting skills.",
            }),
          );
        }
        continue;
      }
      names.push(
        ref.attributeValue === undefined
          ? name
          : `${name} (${ref.attributeValue})`,
      );
    }
    return names;
  }
}
