import { Injectable } from '@nestjs/common';
import { z } from 'zod';

/** One phase of a tournament: its id, and its 1-based order within the tournament. */
export interface TpTournamentPhase {
  id: number;
  /** What a match's `group.phase.order` refers to. */
  order: number;
}

/**
 * The subset of a TP `tournament_<slug>.json` body this tool cares about.
 * `ruleSet` is TP's opaque numeric rule-set code (no human-readable name
 * exists anywhere in the data). Other tournament fields (scoring rules, etc.)
 * are intentionally ignored until a future sub-issue needs them. Phases and
 * category ids are read: phases classify a match's bracket stage, and a
 * category's id is what its inscriptions are requested by.
 */
export interface TpTournament {
  id: number;
  name: string;
  ruleSet: number;
  /** Every category's phases, in listed order. */
  phases: TpTournamentPhase[];
  /** Every category's id, in listed order: what its inscriptions are requested by. */
  categoryIds: number[];
}

const TpTournamentSchema = z.object({
  id: z.number(),
  name: z.string(),
  ruleSet: z.number(),
  categories: z
    .array(
      z.object({
        id: z.number(),
        phases: z
          .array(z.object({ id: z.number(), order: z.number() }))
          .nullish(),
      }),
    )
    .nullish(),
});

@Injectable()
export class TournamentParserService {
  /**
   * Validate and extract `{ id, name, ruleSet, phases, categoryIds }` from a parsed TP
   * tournament JSON body. Extra fields are allowed and dropped. Throws an
   * Error whose message names the failing field on any shape mismatch.
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
      phases: (result.data.categories ?? []).flatMap((category) =>
        (category.phases ?? []).map((phase) => ({
          id: phase.id,
          order: phase.order,
        })),
      ),
      categoryIds: (result.data.categories ?? []).map(
        (category) => category.id,
      ),
    };
  }
}
