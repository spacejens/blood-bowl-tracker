import { z } from 'zod';

import { ExternalIdSchema } from './external-id';

/**
 * A named player ability. Only a name: a skill's category can differ between
 * rules sets, so it lives on the skill × rules-set association rather than
 * here (see skill-rules-set.ts).
 */
export const SkillSchema = z.object({
  id: z.number(),
  name: z.string(),
  createdAt: z.coerce.date(),
});

export const UpsertSkillSchema = z.object({
  // Optional for the same reason every other entity's name is: the upsert
  // overlays only what the entry supplies, so a caller that says nothing
  // about the name leaves the stored one untouched.
  name: z.string().min(1).optional(),
  externalIds: z.array(ExternalIdSchema).min(1),
});

export type Skill = z.infer<typeof SkillSchema>;
export type UpsertSkill = z.infer<typeof UpsertSkillSchema>;
