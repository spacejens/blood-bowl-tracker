import type { PgColumn } from '@blood-bowl-tracker/db';
import type { CharacteristicFormat } from '@blood-bowl-tracker/domain-enums';

import type { CandidateRow } from './fill-plan.types';

/** A candidate as the candidates query reads him: with his team era, which only the queries use. */
export interface CandidateScopeRow extends CandidateRow {
  teamEraId: number;
}

/** A position in an era: what most rules-set rows are scoped by. */
export interface PositionEra {
  positionId: number;
  eraId: number;
}

/** A player and the team era he plays for. */
export interface PlayerTeamEra {
  playerId: number;
  teamEraId: number;
}

/** The candidates, and the ids the queries about them filter by. */
export interface CandidateScope {
  /** The candidates as the planner takes them (no team era). */
  rows: CandidateRow[];
  playerIds: number[];
  teamIds: number[];
  positionIds: number[];
  positionEras: PositionEra[];
  playerTeamEras: PlayerTeamEra[];
}

/** The ids the queries about the candidates' team players filter by. */
export interface TeamPlayerScope {
  playerIds: number[];
  eraIds: number[];
  positionEras: PositionEra[];
}

/** Whether match events record a stat reduction or a death for one candidate. */
export interface ConsequenceRow {
  playerId: number;
  hasStatReduction: boolean;
  hasDeath: boolean;
}

/** One team of one ongoing competition. */
export interface OngoingCompetitionRow {
  competitionId: number;
  competitionName: string;
  teamId: number;
}

/** Which paid advancements to read: those of the team players of these teams. */
export interface PaidAdvancementScope {
  teamIds: number[];
  playerIds: number[];
}

/** The two columns a `(position, era) IN (...)` filter compares. */
export interface PositionEraColumns {
  position: PgColumn;
  era: PgColumn;
}

/** The five characteristic columns of a player or a position-rules-set row. */
export interface LineColumns {
  move: number;
  strength: number;
  agility: number;
  passing: number | null;
  armour: number;
}

/** The five characteristic-format columns of a rules set. */
export interface FormatColumns {
  moveFormat: CharacteristicFormat;
  strengthFormat: CharacteristicFormat;
  agilityFormat: CharacteristicFormat;
  passingFormat: CharacteristicFormat;
  armourFormat: CharacteristicFormat;
}
