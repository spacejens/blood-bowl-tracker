import type { Db } from '@blood-bowl-tracker/db';
import {
  and,
  DB,
  eq,
  externalSystems,
  inArray,
  skillExternalIds,
} from '@blood-bowl-tracker/db';
import { NAME_EXTERNAL_SYSTEM_NAME } from '@blood-bowl-tracker/domain-enums';
import { Inject, Injectable } from '@nestjs/common';

import type { StoredPlayerSkill } from '../advancement-costs/advancement-cost-model.types';
import type { SampledPlayer } from '../shared/review.types';
import { BblPlayerAdvancementsReaderService } from '../source/bbl-player-advancements-reader.service';
import { TpRawPlayerSkillsIndexService } from '../source/tp-raw-player-skills-index.service';
import type { RawSkillMatch, RawVerdict } from './raw-match.types';

/** Whether a skill was present from the start, or gained through advancement. */
type SkillOrigin = 'starting' | 'gained';

/**
 * Checks a player's stored skills against the source the player was sampled
 * through, read through the same services the raw panel uses.
 *
 * Import curates alternate spellings of a skill's name onto one canonical
 * skill (TP's "Bone Head" and the stored "Bone-Head"), so matching by exact
 * name would flag every such curation. Instead a raw name is resolved through
 * `skills_external_ids` (the `Name` system) to the skill id it curates onto,
 * and a stored skill matches a raw one of the same name or the same id —
 * falling back to the name alone when a raw name has no curated `Name` id.
 * A match also needs the raw entry's starting-or-gained origin to agree with
 * the stored row's: a skill the source lists as starting but the import
 * stored as gained (or the reverse) is an import bug, not a spelling, so it
 * still surfaces. Raw skills no stored skill accounts for come back as
 * raw-only.
 */
@Injectable()
export class StoredSkillRawMatchService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly bbl: BblPlayerAdvancementsReaderService,
    private readonly tp: TpRawPlayerSkillsIndexService,
  ) {}

  async match(
    player: SampledPlayer,
    skills: readonly StoredPlayerSkill[],
  ): Promise<RawSkillMatch> {
    const raw = await this.rawSkillOrigins(player);
    if (raw === null) {
      return {
        verdicts: new Map(skills.map((skill) => [skill, 'not read'])),
        rawOnly: [],
      };
    }
    const idByName = await this.resolveRawSkillIds([...raw.keys()]);
    const accounts = (
      name: string,
      origin: SkillOrigin,
      skill: StoredPlayerSkill,
    ): boolean =>
      (name === skill.skillName || idByName.get(name) === skill.skillId) &&
      origin === this.origin(skill);
    const verdicts = new Map<StoredPlayerSkill, RawVerdict>(
      skills.map((skill) => [
        skill,
        [...raw].some(([name, origin]) => accounts(name, origin, skill))
          ? 'yes'
          : 'not in the raw source',
      ]),
    );
    const rawOnly = [...raw]
      .filter(
        ([name, origin]) =>
          !skills.some((skill) => accounts(name, origin, skill)),
      )
      .map(([name]) => name);
    return { verdicts, rawOnly };
  }

  private origin(skill: StoredPlayerSkill): SkillOrigin {
    return skill.source === 'starting' ? 'starting' : 'gained';
  }

  /**
   * Resolves a batch of raw skill names to the skill id each curates onto,
   * via `skills_external_ids`' `Name` system. A raw name with no such row is
   * simply absent from the returned map — the caller falls back to a plain
   * name match for it.
   */
  private async resolveRawSkillIds(
    rawNames: readonly string[],
  ): Promise<Map<string, number>> {
    if (rawNames.length === 0) {
      return new Map();
    }
    const rows = await this.db
      .select({
        externalId: skillExternalIds.externalId,
        skillId: skillExternalIds.skillId,
      })
      .from(skillExternalIds)
      .innerJoin(
        externalSystems,
        eq(externalSystems.id, skillExternalIds.externalSystemId),
      )
      .where(
        and(
          eq(externalSystems.name, NAME_EXTERNAL_SYSTEM_NAME),
          inArray(skillExternalIds.externalId, [...rawNames]),
        ),
      );
    return new Map(rows.map((row) => [row.externalId, row.skillId]));
  }

  /**
   * The raw source's skill names, each with the starting-vs-gained origin
   * the source itself recorded it under — or null when the source has no
   * data at all.
   */
  private async rawSkillOrigins(
    player: SampledPlayer,
  ): Promise<Map<string, SkillOrigin> | null> {
    if (player.source === 'bbl') {
      const raw = await this.bbl.read(player.externalId);
      return raw === null
        ? null
        : new Map(raw.skills.map((skill) => [skill.name, skill.source]));
    }
    const raw = await this.tp.advancementsFor(player.externalId);
    if (raw === null) {
      return null;
    }
    const origins = new Map<string, SkillOrigin>();
    for (const skill of raw.startingSkills) {
      if (skill.name !== null) {
        origins.set(skill.name, 'starting');
      }
    }
    for (const skill of raw.gainedSkills) {
      if (skill.name !== null) {
        origins.set(skill.name, 'gained');
      }
    }
    return origins;
  }
}
