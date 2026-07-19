import { Injectable } from '@nestjs/common';
import { z } from 'zod';

/**
 * The subset of a TP `tournament_<slug>.json` body this tool cares about.
 * `ruleSet` is TP's opaque numeric rule-set code (no human-readable name
 * exists anywhere in the data). Other tournament fields (categories, phases,
 * scoring rules, etc.) are intentionally ignored until a future sub-issue
 * needs them.
 */
export interface TpTournament {
  id: number;
  name: string;
  ruleSet: number;
}

const TpTournamentSchema = z.object({
  id: z.number(),
  name: z.string(),
  ruleSet: z.number(),
});

@Injectable()
export class TournamentParserService {
  /**
   * Validate and extract `{ id, name, ruleSet }` from a parsed TP tournament
   * JSON body. Extra fields are allowed and dropped. Throws an Error whose
   * message names the failing field on any shape mismatch.
   */
  parse(content: unknown): TpTournament {
    const result = TpTournamentSchema.safeParse(content);
    if (!result.success) {
      throw new Error(
        `Invalid TP tournament JSON: ${result.error.issues
          .map(
            (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
          )
          .join('; ')}`,
      );
    }
    return {
      id: result.data.id,
      name: result.data.name,
      ruleSet: result.data.ruleSet,
    };
  }
}
