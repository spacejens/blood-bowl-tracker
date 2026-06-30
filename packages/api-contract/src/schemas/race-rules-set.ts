import { z } from 'zod';

export const RaceRulesSetSchema = z.object({
  raceId: z.number(),
  rulesSetId: z.number(),
});

export const CreateRaceRulesSetSchema = z.object({
  raceId: z.number().int(),
  rulesSetId: z.number().int(),
});

export type RaceRulesSet = z.infer<typeof RaceRulesSetSchema>;
export type CreateRaceRulesSet = z.infer<typeof CreateRaceRulesSetSchema>;
