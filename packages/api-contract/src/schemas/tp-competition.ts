import { z } from 'zod';

import { ImportResultSchema } from './import-result';

/** A TP tournament's identity: all a competition import reads of it. */
export const TpCompetitionTournamentSchema = z.object({
  id: z.number().int(),
  name: z.string().min(1),
});

/**
 * One award handed out in a TP competition, from
 * `awards_<slug>_awards.json`, as packages/parse-tp's AwardsParserService
 * reads it.
 *
 * `rosterId` comes from `inscription.roster.id`. The award entry's coach and
 * player identity fields (`inscription.player`, `inscription.players`,
 * `inscription.coachRank`) are deliberately not carried: they are a less
 * complete duplicate of data the inscriptions import already covers, and TP
 * records no individual player awards at all.
 */
export const TpCompetitionAwardSchema = z.object({
  id: z.number().int(),
  /**
   * TP's raw numeric code (1/2/3 placements; 100 and 200 are the same Best
   * Stunty / Wooden Spoon pair under fourth- and third-era numbering). It is
   * NOT globally unique per trophy: the same code means a different trophy
   * in a different competition group, so classification is left to the
   * importer.
   */
  awardType: z.number().int(),
  /**
   * Present only on the stunty/spoon entries, where it is exactly "Best
   * Stunty" or "Wooden Spoon" and is the only thing separating the two
   * within one file.
   */
  name: z.string().optional(),
  rosterId: z.number().int(),
});

/** Input of `tpCompetitions.import`. */
export const ImportTpCompetitionSchema = z.object({
  /** The tournament's TP id and name. */
  tournament: TpCompetitionTournamentSchema,
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

export type TpCompetitionTournament = z.infer<
  typeof TpCompetitionTournamentSchema
>;
export type TpCompetitionAward = z.infer<typeof TpCompetitionAwardSchema>;
export type ImportTpCompetition = z.infer<typeof ImportTpCompetitionSchema>;
export type TpCompetitionImportResult = z.infer<
  typeof TpCompetitionImportResultSchema
>;
