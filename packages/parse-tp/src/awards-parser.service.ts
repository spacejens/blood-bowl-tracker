import type { TpCompetitionAward } from '@blood-bowl-tracker/api-contract';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';

const TpAwardEntrySchema = z.object({
  id: z.number(),
  awardType: z.number(),
  name: z.string().optional(),
  inscription: z.object({ roster: z.object({ id: z.number() }) }),
});

/** The file is an object keyed by TP's category id, each value an array. */
const TpAwardsFileSchema = z.record(z.string(), z.array(TpAwardEntrySchema));

@Injectable()
export class AwardsParserService {
  /**
   * Validate and flatten a parsed TP awards JSON body into one list of
   * awards, in category order then file order. Extra fields are allowed and
   * dropped. Throws an Error whose message names the failing field on any
   * shape mismatch. A file with no categories, or with only empty ones,
   * yields an empty list rather than an error -- TP writes those. Each award
   * is one `TpCompetitionAward` (packages/api-contract), which documents what
   * `awardType` and `name` mean.
   */
  parse(content: unknown): TpCompetitionAward[] {
    const result = TpAwardsFileSchema.safeParse(content);
    if (!result.success) {
      throw new Error(
        `Invalid TP awards JSON: ${result.error.issues
          .map(
            (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
          )
          .join('; ')}`,
      );
    }
    return Object.values(result.data).flatMap((entries) =>
      entries.map((entry) => ({
        id: entry.id,
        awardType: entry.awardType,
        ...(entry.name === undefined ? {} : { name: entry.name }),
        rosterId: entry.inscription.roster.id,
      })),
    );
  }
}
