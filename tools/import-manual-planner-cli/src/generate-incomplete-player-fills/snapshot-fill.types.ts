/** One `tourplay.net` id of a skill: a skillMasterId TP names it by (TP gives a skill a new id per rules set). */
export interface TpSkillIdRow {
  skillId: number;
  masterId: string;
}

/** One `tourplay.net` id of a candidate's position: a lineUpMasterId TP lists it by. */
export interface TpPositionIdRow {
  positionId: number;
  tpPositionId: string;
}
