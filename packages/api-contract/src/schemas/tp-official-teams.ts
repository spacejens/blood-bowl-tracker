import { z } from 'zod';

import { ImportResultSchema } from './import-result';

/** One position's five characteristics, as TP's official team list gives them. */
const TpOfficialCharacteristicsSchema = z.object({
  move: z.number().int(),
  strength: z.number().int(),
  agility: z.number().int(),
  passing: z.number().int(),
  armour: z.number().int(),
});

/**
 * One starting-skill reference, in packages/parse-tp's two shapes: by TP
 * `skillMasterId` (with any separate attribute value and TP's attribute
 * type), or by name (a star's own special rule).
 */
const TpOfficialSkillRefSchema = z.union([
  z.object({
    skillMasterId: z.number().int(),
    attributeValue: z.string().optional(),
    attributeType: z.number().int().optional(),
  }),
  z.object({ name: z.string().min(1) }),
]);

/** One official-list position or star, as packages/parse-tp reads it. */
const TpOfficialPositionSchema = z.object({
  name: z.string().min(1),
  isStarPlayer: z.boolean(),
  tpPositionId: z.number().int().optional(),
  characteristics: TpOfficialCharacteristicsSchema,
  skills: z.array(TpOfficialSkillRefSchema),
  keywordCodes: z.array(z.number().int()),
});

/** One official-list race for one rules set, as packages/parse-tp reads it. */
const TpOfficialRaceSchema = z.object({
  name: z.string().min(1),
  teamRaceCode: z.string().min(1),
  isOfficial: z.boolean(),
  positions: z.array(TpOfficialPositionSchema),
});

/** A TP skill's name and elite marker, for one `skillMasterId`. */
export const TpSkillMasterNameSchema = z.object({
  skillMasterId: z.number().int(),
  name: z.string().min(1),
  isElite: z.boolean(),
});

/** Input of `tpOfficialTeams.import`: one rules set's official team list. */
export const ImportTpOfficialTeamsSchema = z.object({
  /** The rules set the list is for, by name (its TP external id). */
  rulesSet: z.string().min(1),
  /** Every official and legacy race TP lists for that rules set, parsed. */
  races: z.array(TpOfficialRaceSchema),
  /**
   * Names for the `skillMasterId`s the races reference, when the caller has
   * them (tools/import-tp scans them from its downloaded files). A named
   * skill is upserted by name, registering every id given for that name; an
   * id with no name here resolves only through a skill that already carries
   * it as a TP external id.
   */
  skillMasters: z.array(TpSkillMasterNameSchema).default([]),
  /** The name TP's external system is registered under. */
  externalSystemName: z.string().min(1),
});

/** One position's characteristics under one rules set, as written. */
export const TpOfficialPositionCharacteristicsSchema =
  TpOfficialCharacteristicsSchema.extend({
    positionId: z.number().int(),
    rulesSetId: z.number().int(),
  });

/**
 * Output of `tpOfficialTeams.import`, one result per stage, plus every
 * imported position's characteristics under the rules set, which a caller
 * importing hired star players later needs as their template values.
 */
export const TpOfficialTeamsImportResultSchema = z.object({
  races: ImportResultSchema,
  positions: ImportResultSchema,
  characteristics: ImportResultSchema,
  keywords: ImportResultSchema,
  startingSkills: ImportResultSchema,
  positionCharacteristics: z.array(TpOfficialPositionCharacteristicsSchema),
});

export type TpSkillMasterName = z.infer<typeof TpSkillMasterNameSchema>;
export type ImportTpOfficialTeams = z.infer<typeof ImportTpOfficialTeamsSchema>;
export type TpOfficialPositionCharacteristics = z.infer<
  typeof TpOfficialPositionCharacteristicsSchema
>;
export type TpOfficialTeamsImportResult = z.infer<
  typeof TpOfficialTeamsImportResultSchema
>;
