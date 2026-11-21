import { Injectable } from '@nestjs/common';

import type { SkillNameRow } from './fill-plan.types';
import type { TpSkillIdRow } from './snapshot-fill.types';

export interface SnapshotSkill {
  skillId: number;
  /** The skill's stored name; null when it has no Name id, or several. */
  skillName: string | null;
  /** Its one Name id; null when it has none, or several. */
  nameId: string | null;
  /** Whether some player or position holds it with a variant. */
  attributed: boolean;
}

export interface ResolveSnapshotSkillsInput {
  /** The snapshot's skillMasterIds. */
  masterIds: readonly number[];
  tpSkillIds: readonly TpSkillIdRow[];
  skillNames: readonly SkillNameRow[];
  attributedSkillIds: ReadonlySet<number>;
}

/**
 * Resolves a roster snapshot's skillMasterIds the way import-tp-live's
 * TpSkillIdLookupService does: each id names the one stored skill carrying
 * it as a `tourplay.net` external id. An id no skill carries, or several
 * do, leaves the whole player unresolved. Each skill comes with its Name id
 * when it has exactly one, and with whether it is held with a variant
 * anywhere, which a snapshot cannot show.
 *
 * Pure decision logic, with no I/O and no dependencies.
 */
@Injectable()
export class SnapshotSkillResolverService {
  resolve(input: ResolveSnapshotSkillsInput): SnapshotSkill[] | undefined {
    const skills: SnapshotSkill[] = [];
    for (const masterId of input.masterIds) {
      const skillIds = new Set(
        input.tpSkillIds
          .filter((row) => row.masterId === String(masterId))
          .map((row) => row.skillId),
      );
      if (skillIds.size !== 1) {
        return undefined;
      }
      const [skillId] = skillIds;
      skills.push(this.named(skillId, input));
    }
    return skills;
  }

  private named(
    skillId: number,
    input: ResolveSnapshotSkillsInput,
  ): SnapshotSkill {
    const names = input.skillNames.filter((row) => row.skillId === skillId);
    const one = new Set(names.map((row) => row.nameId)).size === 1;
    return {
      skillId,
      skillName: one ? names[0].skillName : null,
      nameId: one ? names[0].nameId : null,
      attributed: input.attributedSkillIds.has(skillId),
    };
  }
}
