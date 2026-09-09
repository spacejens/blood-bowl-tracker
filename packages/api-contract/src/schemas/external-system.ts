import { EXTERNAL_SYSTEM_CATEGORIES } from '@blood-bowl-tracker/domain-enums';
import { z } from 'zod';

/**
 * See `EXTERNAL_SYSTEM_CATEGORIES` in `@blood-bowl-tracker/domain-enums` for
 * what each category means.
 */
export const ExternalSystemCategorySchema = z.enum(EXTERNAL_SYSTEM_CATEGORIES);

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
