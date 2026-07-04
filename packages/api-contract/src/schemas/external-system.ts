import { z } from 'zod';

export const ExternalSystemSchema = z.object({
  id: z.number(),
  name: z.string(),
  createdAt: z.coerce.date(),
});

export const CreateExternalSystemSchema = z.object({
  name: z.string().min(1),
});

export const UpsertExternalSystemSchema = z.object({
  name: z.string().min(1),
});

export type ExternalSystem = z.infer<typeof ExternalSystemSchema>;
export type CreateExternalSystem = z.infer<typeof CreateExternalSystemSchema>;
export type UpsertExternalSystem = z.infer<typeof UpsertExternalSystemSchema>;
