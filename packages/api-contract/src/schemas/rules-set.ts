import { z } from 'zod';

export const RulesSetSchema = z.object({
  id: z.number(),
  name: z.string(),
  createdAt: z.coerce.date(),
});

export const CreateRulesSetSchema = z.object({
  name: z.string().min(1),
});

export type RulesSet = z.infer<typeof RulesSetSchema>;
export type CreateRulesSet = z.infer<typeof CreateRulesSetSchema>;
