import type { ImportError, ImportResult } from '@blood-bowl-tracker/import';
import {
  ImportResultService,
  StartingSkillsImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

export interface SyncPositionSkillsOptions {
  /** Which rules sets each position was determined available under. */
  rulesSetIdsByPositionId: Map<number, Set<number>>;
  /** The skill names scraped from each position's page. */
  skillsByPositionId: Map<number, string[]>;
}

/**
 * Writes each position's starting skills under every rules set it played
 * under. BBL is a single BB2020-era snapshot with one skill list per position,
 * so that one list is written to every rules set the position is available
 * under -- exactly as BblPositionCharacteristicsImportService does with the
 * one scraped stat line. Curated pre-BB2020 lists are imported separately
 * afterwards; `position_rules_set_skills` is additive per (position, rules
 * set), so the two never fight over a value.
 *
 * BBL-local rather than shared: the era -> rules-set resolution feeding it is
 * BBL's own. The shared piece is StartingSkillsImportService, which this
 * consumes unchanged.
 *
 * `StartingSkillsImportService.syncStartingSkills` caches its skill-id
 * resolutions, curated-category reads and error-dedup for a single call, so
 * this service accumulates every position's data into one
 * `StartingSkillNames` map and calls it exactly once — never per position or
 * per rules set.
 */
@Injectable()
export class BblPositionSkillsImportService {
  constructor(
    private readonly startingSkills: StartingSkillsImportService,
    private readonly importResults: ImportResultService,
  ) {}

  async syncPositionSkills({
    rulesSetIdsByPositionId,
    skillsByPositionId,
  }: SyncPositionSkillsOptions): Promise<{ result: ImportResult }> {
    const errors: ImportError[] = [];
    const skillNamesByPositionId = new Map<number, Map<number, string[]>>();

    for (const [positionId, rulesSetIds] of rulesSetIdsByPositionId) {
      const skills = skillsByPositionId.get(positionId);
      // No entry means the page showed no Skills cell at all (its parse
      // failure, if any, was already reported by the positions step); an empty
      // one means a position that genuinely starts with nothing. Neither has
      // anything to write.
      if (!skills || skills.length === 0) {
        continue;
      }
      const byRulesSetId = new Map<number, string[]>();
      for (const rulesSetId of rulesSetIds) {
        byRulesSetId.set(rulesSetId, skills);
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
}
