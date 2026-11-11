import type {
  TpOfficialCharacteristics,
  TpOfficialSkillIdRef,
} from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';

/**
 * One skill entry as TP nests it, on a roster's position template, a
 * player's gained skills or an official-list entry: the id plus an optional
 * `skillAttributeMaster` holding the parenthetical value and its type.
 */
export interface TpRawSkillRef {
  skillMasterId: number;
  skillAttributeMaster?: { value: string; type: number };
}

/** The five characteristics as TP abbreviates them on every entry. */
export interface TpRawCharacteristics {
  ma: number;
  st: number;
  ag: number;
  pa: number;
  av: number;
}

/**
 * Maps TP's raw characteristics and skill entries to the contract's shapes.
 * The one place this mapping is written: both the roster parser and the
 * official-team-list parser use it. Pure, with no dependencies.
 */
@Injectable()
export class TpSkillRefMapperService {
  /**
   * One skill reference, with its attribute split out of TP's nested object.
   * The attribute keys are omitted, not set to `undefined`, when TP carries
   * no attribute. Any other field on the entry is not copied.
   */
  skillRef(skill: TpRawSkillRef): TpOfficialSkillIdRef {
    if (skill.skillAttributeMaster === undefined) {
      return { skillMasterId: skill.skillMasterId };
    }
    return {
      skillMasterId: skill.skillMasterId,
      attributeValue: skill.skillAttributeMaster.value,
      attributeType: skill.skillAttributeMaster.type,
    };
  }

  /** TP's `ma/st/ag/pa/av` under the contract's characteristic names. */
  characteristics(entry: TpRawCharacteristics): TpOfficialCharacteristics {
    return {
      move: entry.ma,
      strength: entry.st,
      agility: entry.ag,
      passing: entry.pa,
      armour: entry.av,
    };
  }
}
