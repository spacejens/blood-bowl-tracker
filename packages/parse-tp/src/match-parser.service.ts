import { Injectable } from '@nestjs/common';
import { z } from 'zod';

/**
 * The subset of a TP `match_<id>.json` body this tool cares about. Other match
 * fields (state, round, turn, inscriptionLocal, matchEvents, rosters, etc.) are
 * intentionally ignored until a future matches sub-issue needs them — the same
 * "parse only what's needed" convention as TournamentParserService.
 *
 * `scheduledDate` is the resolved play date: TP's `scheduledDate` when present
 * and non-null, otherwise `createdInstant` (always present in the data). It is
 * always a Date because the required `createdInstant` fallback guarantees one.
 */
export interface TpMatch {
  id: number;
  scheduledDate: Date;
}

const TpMatchSchema = z.object({
  matchId: z.number(),
  scheduledDate: z.string().nullish(),
  createdInstant: z.string(),
});

@Injectable()
export class MatchParserService {
  /**
   * Validate and extract `{ id, scheduledDate }` from a parsed TP match JSON
   * body. `matchId` maps to `id`; the play date is `scheduledDate` when set,
   * else `createdInstant`. Extra fields are allowed and dropped. Throws an
   * Error whose message names the failing field on any shape mismatch, or when
   * the resolved date string cannot be parsed.
   */
  parse(content: unknown): TpMatch {
    const result = TpMatchSchema.safeParse(content);
    if (!result.success) {
      throw new Error(
        `Invalid TP match JSON: ${result.error.issues
          .map(
            (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
          )
          .join('; ')}`,
      );
    }
    const { matchId, scheduledDate, createdInstant } = result.data;
    const dateSource = scheduledDate ?? createdInstant;
    const date = new Date(dateSource);
    if (Number.isNaN(date.getTime())) {
      throw new Error(
        `Invalid TP match JSON: date "${dateSource}" is not a valid date.`,
      );
    }
    return { id: matchId, scheduledDate: date };
  }
}
