import { z } from 'zod';

export const ExternalIdSchema = z.object({
  externalSystemId: z.number().int(),
  externalId: z.string().min(1),
});

export type ExternalId = z.infer<typeof ExternalIdSchema>;
