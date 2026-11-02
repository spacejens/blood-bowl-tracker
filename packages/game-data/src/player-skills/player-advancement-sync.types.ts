import type { NewPlayerAdvancement } from '@blood-bowl-tracker/db';
import type {
  PlayerCharacteristic,
  PlayerSkillSource,
} from '@blood-bowl-tracker/domain-enums';

import type {
  CharacteristicPlan,
  CharacteristicRowInsert,
  IncomingCharacteristicEntry,
} from './characteristic-advancement-planner.service';

/**
 * One skill entry with its identity fields normalised. `attributeValue` is
 * part of the row's natural key, so an omitted value collapses to `null`
 * immediately — unlike `advancementOrder`, which stays `undefined` when the
 * entry said nothing, the overlay convention every upsert-style write here
 * follows.
 */
export interface ResolvedPlayerSkill {
  /** The entry's index in the sync batch. */
  index: number;
  playerId: number;
  skillId: number;
  source: PlayerSkillSource;
  attributeValue: string | null;
  advancementOrder: number | null | undefined;
  orderConfirmed: boolean;
  isFreeExtra: boolean;
}

/** One characteristic entry, with the batch index it came from. */
export interface ResolvedCharacteristic extends IncomingCharacteristicEntry {
  playerId: number;
}

/** A batch's entries, split into skills and characteristic increases. */
export interface ResolvedEntries {
  skills: ResolvedPlayerSkill[];
  characteristics: ResolvedCharacteristic[];
}

/** The mutable half of a skill row, once its natural key has matched. */
export interface PlayerSkillUpdate {
  id: number;
  values: {
    source?: PlayerSkillSource;
    advancementOrder?: number | null;
    orderConfirmed?: boolean;
    isFreeExtra?: true;
  };
}

/** A new skill row, with the batch index it came from. */
export interface SkillInsert {
  index: number;
  values: NewPlayerAdvancement;
}

/** The skill rows a sync writes, and whose players they change. */
export interface SkillWrites {
  updates: PlayerSkillUpdate[];
  inserts: SkillInsert[];
  changedPlayerIds: number[];
}

/** A new characteristic row, for the player it belongs to. */
export type CharacteristicInsert = CharacteristicRowInsert & {
  playerId: number;
};

/** The characteristic rows a sync writes, and whose players they change. */
export interface CharacteristicWrites {
  updates: CharacteristicPlan['updates'];
  inserts: CharacteristicInsert[];
  changedPlayerIds: number[];
}

/** One stored row of the batch's players, as the sync reads it. */
export interface ExistingRow {
  id: number;
  playerId: number;
  skillId: number | null;
  characteristic: PlayerCharacteristic | null;
  source: PlayerSkillSource;
  attributeValue: string | null;
  advancementOrder: number | null;
  orderConfirmed: boolean;
  isFreeExtra: boolean;
  removed: boolean;
}
