import { z } from 'zod';

export const UpsertExternalIdSchema = z.object({
  externalSystemId: z.number().int(),
  externalId: z.string().min(1),
});

export type UpsertExternalId = z.infer<typeof UpsertExternalIdSchema>;
