import type { UpsertedTpCompetition } from './tp-competition-upsert.service';

export const TP_SYSTEM_ID = 1;
export const COMPETITION_ID = 12;
export const COMPETITION_TP_ID = 18442;
export const ERA_ID = 40;
export const COMPETITION_GROUP_ID = 7;

/** A season competition, upserted under the TP system. */
export function upsertedCompetition(
  overrides: Partial<UpsertedTpCompetition> = {},
): UpsertedTpCompetition {
  return {
    tpSystemId: TP_SYSTEM_ID,
    competitionId: COMPETITION_ID,
    competitionTpId: COMPETITION_TP_ID,
    eraId: ERA_ID,
    competitionGroupId: COMPETITION_GROUP_ID,
    ...overrides,
  };
}
