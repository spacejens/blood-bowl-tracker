import { KEYWORD_KINDS } from '@blood-bowl-tracker/domain-enums';
import { z } from 'zod';

import { ExternalIdSchema } from './external-id';

/** See `KEYWORD_KINDS` in `@blood-bowl-tracker/domain-enums`. */
export const KeywordKindSchema = z.enum(KEYWORD_KINDS);

/**
 * A BB2025 keyword. Name and kind only: unlike a skill's category, a
 * keyword's kind cannot differ between rules sets, because the whole concept
 * exists under one rules set.
 */
export const KeywordSchema = z.object({
  id: z.number(),
  name: z.string(),
  kind: KeywordKindSchema,
  createdAt: z.coerce.date(),
});

export const UpsertKeywordSchema = z.object({
  // Optional for the same reason every other entity's name is: the upsert
  // overlays only what the entry supplies. Both are required on a create,
  // which the server reports as a BAD_REQUEST naming the missing column.
  name: z.string().min(1).optional(),
  kind: KeywordKindSchema.optional(),
  externalIds: z.array(ExternalIdSchema).min(1),
});

/**
 * Read the whole catalogue as one external system names it. An import tool
 * holds only that system's numeric codes and has no way to name a keyword
 * from its own data, so it reads the 48-row catalogue once per run rather
 * than resolving code by code.
 */
export const ListKeywordsSchema = z.object({
  externalSystemId: z.number().int(),
});

export const KeywordCatalogEntrySchema = z.object({
  keywordId: z.number(),
  name: z.string(),
  kind: KeywordKindSchema,
  externalId: z.string(),
});

export type KeywordKind = z.infer<typeof KeywordKindSchema>;
export type Keyword = z.infer<typeof KeywordSchema>;
export type UpsertKeyword = z.infer<typeof UpsertKeywordSchema>;
export type ListKeywords = z.infer<typeof ListKeywordsSchema>;
export type KeywordCatalogEntry = z.infer<typeof KeywordCatalogEntrySchema>;
