import { z } from 'zod';

import { ImportResultSchema } from './import-result';

/**
 * One match's position in its TP competition's bracket: all a match's
 * category classification reads. A season's playoff stage is identified by
 * the ascending `(phaseOrder, round)` position among every match in the
 * competition, and a final is told from a bronze match by which teams won
 * the semifinals — so classifying one match needs this for all of them.
 */
export const TpBracketMatchSchema = z.object({
  id: z.number().int(),
  phaseOrder: z.number().int(),
  round: z.number().int(),
  homeTeamTpId: z.number().int(),
  awayTeamTpId: z.number().int(),
  /** Absent when TP records no result for the match yet. */
  winner: z.enum(['home', 'away', 'draw']).optional(),
});

/** Input of `tpMatches.import`. */
export const ImportTpMatchSchema = z.object({
  /** One TP match exactly as TP's API returns it; parsed server-side. */
  match: z.unknown(),
  /** Every match in the match's competition, the match itself included. */
  bracket: z.array(TpBracketMatchSchema),
  /** TP's id of the match's competition (its tournament id), already imported. */
  competitionTpId: z.number().int(),
  /** The name TP's external system is registered under. */
  externalSystemName: z.string().min(1),
});

/**
 * Output of `tpMatches.import`, one result per stage: `match` (resolving its
 * competition and teams, classifying it and upserting its row),
 * `participation` (its teams, on the match and on the competition), `events`
 * and `outcome`. A stage whose prerequisite failed reports nothing imported
 * and no error of its own.
 */
export const TpMatchImportResultSchema = z.object({
  match: ImportResultSchema,
  participation: ImportResultSchema,
  events: ImportResultSchema,
  outcome: ImportResultSchema,
});

export type TpBracketMatch = z.infer<typeof TpBracketMatchSchema>;
export type ImportTpMatch = z.infer<typeof ImportTpMatchSchema>;
export type TpMatchImportResult = z.infer<typeof TpMatchImportResultSchema>;
