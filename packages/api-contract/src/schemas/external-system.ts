import { z } from 'zod';

export const ExternalSystemCategorySchema = z.enum([
  'bookkeeping',
  'imported_data_source',
  'referenced_not_imported',
]);

export const ExternalSystemSchema = z.object({
  id: z.number(),
  name: z.string(),
  category: ExternalSystemCategorySchema,
  createdAt: z.coerce.date(),
});

export const UpsertExternalSystemSchema = z.object({
  name: z.string().min(1),
  category: ExternalSystemCategorySchema,
});

export type ExternalSystemCategory = z.infer<
  typeof ExternalSystemCategorySchema
>;
export type ExternalSystem = z.infer<typeof ExternalSystemSchema>;
export type UpsertExternalSystem = z.infer<typeof UpsertExternalSystemSchema>;
