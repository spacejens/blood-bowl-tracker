import { z } from 'zod';

export const CompetitionTypeEnum = z.enum(['season', 'cup']);

export const CompetitionSchema = z.object({
  id: z.number(),
  name: z.string(),
  type: CompetitionTypeEnum,
  eraId: z.number(),
  createdAt: z.coerce.date(),
});

export const CreateCompetitionSchema = z.object({
  name: z.string().min(1),
  type: CompetitionTypeEnum,
  eraId: z.number().int(),
});

export type Competition = z.infer<typeof CompetitionSchema>;
export type CreateCompetition = z.infer<typeof CreateCompetitionSchema>;
