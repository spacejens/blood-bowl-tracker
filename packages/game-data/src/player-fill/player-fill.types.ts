import type { ExternalId } from '@blood-bowl-tracker/api-contract';
import type {
  PlayerCharacteristic,
  PlayerSkillSource,
  PlayerStatus,
} from '@blood-bowl-tracker/domain-enums';

import type { StoredPlayerAdvancement } from '../player-skills/player-advancement-reads.service';

/** One advancement row a fill leaves the player with. */
export interface PlannedFillRow {
  /** Null for a characteristic increase. */
  skillId: number | null;
  /** Null for a skill. */
  characteristic: PlayerCharacteristic | null;
  attributeValue: string | null;
  source: PlayerSkillSource;
  /** After the server's free-extra rules (Hatred, Loner, a trophy's skill). */
  isFreeExtra: boolean;
  /** Its number among the paid advancements; null for a starting skill or a free extra. */
  paidNumber: number | null;
}

/** One active (not removed) advancement row stored for the player. */
export type StoredFillRow = StoredPlayerAdvancement;

/** The player columns a fill writes, as stored. */
export interface StoredFillFields {
  move: number;
  strength: number;
  agility: number;
  passing: number | null;
  armour: number;
  sppTotal: number | null;
  sppAdjustment: number | null;
  unspentSpp: number | null;
  status: PlayerStatus | null;
}

/** Everything a fill checks about one stored player. */
export interface PlayerFillState {
  playerId: number;
  isStarPlayer: boolean;
  /** His TP external id; undefined when he has none, so is not a TP player. */
  tpExternalId: ExternalId | undefined;
  /** Whether INCOMPLETE_PLAYER_CRITERIA still matches him. */
  incomplete: boolean;
  fields: StoredFillFields;
  rows: StoredFillRow[];
  /** The rules sets of his team's era. */
  rulesSetIds: number[];
}
