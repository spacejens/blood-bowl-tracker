import { z } from 'zod';

import { ImportResultSchema } from './import-result';

/**
 * One team award from a TP competition's awards, as packages/parse-tp's
 * AwardsParserService reads it. `awardType` is TP's raw code, and `name` is
 * present only on the entries it disambiguates (Best Stunty, Wooden Spoon).
 */
export const TpCompetitionAwardSchema = z.object({
  id: z.number().int(),
  awardType: z.number().int(),
  name: z.string().optional(),
  rosterId: z.number().int(),
});

/** Input of `tpCompetitions.import`. */
export const ImportTpCompetitionSchema = z.object({
  /** The tournament's TP id and name. */
  tournament: z.object({ id: z.number().int(), name: z.string().min(1) }),
  /** Every dated match's date across the competition; ISO strings on the wire. */
  playedDates: z.array(z.coerce.date()),
  /** The era to import a new competition under, by name (its TP external id). */
  era: z.string().min(1),
  /** TP roster ids of every team registered to the competition. */
  participantRosterIds: z.array(z.number().int()),
  /** The competition's awards; empty for one with none yet. */
  awards: z.array(TpCompetitionAwardSchema),
  /** The name TP's external system is registered under. */
  externalSystemName: z.string().min(1),
});

/**
 * Output of `tpCompetitions.import`, one result per stage: `competition`
 * (its upsert), `participation` (linking its registered teams) and
 * `trophyAwards`. A stage whose prerequisite failed reports nothing imported
 * and no error of its own.
 */
export const TpCompetitionImportResultSchema = z.object({
  competition: ImportResultSchema,
  participation: ImportResultSchema,
  trophyAwards: ImportResultSchema,
});

export type TpCompetitionAward = z.infer<typeof TpCompetitionAwardSchema>;
export type ImportTpCompetition = z.infer<typeof ImportTpCompetitionSchema>;
export type TpCompetitionImportResult = z.infer<
  typeof TpCompetitionImportResultSchema
>;
