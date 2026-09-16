import type { RulesSet } from '@blood-bowl-tracker/api-contract';
import type {
  ImportError,
  ImportResult,
  StartingSkillRef,
} from '@blood-bowl-tracker/import';
import {
  ImportResultService,
  StartingSkillsImportService,
} from '@blood-bowl-tracker/import';
import { Injectable } from '@nestjs/common';

/** Rules sets fully curated by after-other-importers/position-skills.json5,
 * so BBL's single scraped snapshot must never write to them. Exported so
 * bbl-position-skills-import.service.spec.ts can pin this list directly
 * against curated-data-skills.spec.ts's "curates exactly the rules sets
 * BblPositionSkillsImportService excludes itself from" test in
 * tools/import-manual, which cannot import this constant (tools/import-manual
 * declares no dependency on tools/import-bbl) and instead hardcodes the same
 * list -- the two specs together catch drift in either direction. */
export const CURATION_OWNED_RULES_SET_NAMES = ['CRP', 'CRP+', 'BB2016'];

export interface SyncPositionSkillsOptions {
  /** Which rules sets each position was determined available under. */
  rulesSetIdsByPositionId: Map<number, Set<number>>;
  /** The skill refs scraped from each position's page. BBL has no concept of
   * BB2025 eliteness -- and is excluded from writing BB2025 starting skills
   * anyway -- so every ref is marked not elite below. */
  skillsByPositionId: Map<number, { name: string; attributeValue?: string }[]>;
  /** Rules set by name, used to resolve the curation-owned rules sets to
   * exclude below. A name missing from this map is simply skipped -- not
   * every environment necessarily has every rules set configured. */
  rulesSetsByName: Map<string, RulesSet>;
}

/**
 * Writes each position's starting skills under every rules set it played
 * under, EXCEPT the three older rules sets (CRP, CRP+, BB2016) that
 * after-other-importers/position-skills.json5 curates completely. BBL is a
 * single BB2020-era snapshot with one skill list per position -- fine for
 * `BblPositionCharacteristicsImportService`'s single overwritable value, since
 * curation runs after BBL and always wins by overwriting it. It is NOT fine
 * here: `position_rules_set_skills` is additive per (position, rules set) --
 * it only inserts missing rows, never deletes -- so if BBL wrote its modern
 * skill list into e.g. a CRP position, the curated CRP list imported
 * afterwards would merge into a union instead of replacing it, and BBL's
 * wrong skills would be permanently and silently stuck there with no way for
 * curation to remove them. Excluding these three rules sets loses no
 * coverage: every (position, rules set) pair they need is already curated.
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
    rulesSetsByName,
  }: SyncPositionSkillsOptions): Promise<{ result: ImportResult }> {
    const errors: ImportError[] = [];
    const skillNamesByPositionId = new Map<
      number,
      Map<number, StartingSkillRef[]>
    >();
    const excludedRulesSetIds = new Set(
      CURATION_OWNED_RULES_SET_NAMES.map(
        (name) => rulesSetsByName.get(name)?.id,
      ).filter((id): id is number => id !== undefined),
    );
    const rulesSetNamesById = new Map(
      [...rulesSetsByName.values()].map((rulesSet) => [
        rulesSet.id,
        rulesSet.name,
      ]),
    );

    for (const [positionId, rulesSetIds] of rulesSetIdsByPositionId) {
      const skills = skillsByPositionId.get(positionId);
      // No entry means the page showed no Skills cell at all (its parse
      // failure, if any, was already reported by the positions step); an empty
      // one means a position that genuinely starts with nothing. Neither has
      // anything to write.
      if (!skills || skills.length === 0) {
        continue;
      }
      const eliteless: StartingSkillRef[] = skills.map((skill) => ({
        ...skill,
        isElite: false,
      }));
      const byRulesSetId = new Map<number, StartingSkillRef[]>();
      for (const rulesSetId of rulesSetIds) {
        if (excludedRulesSetIds.has(rulesSetId)) {
          continue;
        }
        byRulesSetId.set(rulesSetId, eliteless);
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
}
