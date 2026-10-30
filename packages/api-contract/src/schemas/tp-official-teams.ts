import { z } from 'zod';

import { ImportResultSchema } from './import-result';
import { PositionSkillCategoriesSchema } from './position-rules-set-skill-category';

/**
 * One position's five characteristics, as TP publishes them per lineUp/star
 * master. `passing` is a plain number, never null: TP writes a literal 0 for
 * a position with no passing ability.
 */
export const TpOfficialCharacteristicsSchema = z.object({
  move: z.number().int(),
  strength: z.number().int(),
  agility: z.number().int(),
  passing: z.number().int(),
  armour: z.number().int(),
});

/**
 * The ordinary starting-skill reference: TP names the skill only by
 * `skillMasterId`, and `attributeValue` is the parenthetical value it stores
 * separately (`"4+"` for Loner, `"+1"` for Mighty Blow).
 */
export const TpOfficialSkillIdRefSchema = z.object({
  skillMasterId: z.number().int(),
  attributeValue: z.string().optional(),
  /**
   * TP's own tag for what kind of value `attributeValue` holds. Types 0
   * (dice-roll thresholds like `"4+"`), 1 (numeric bonuses like `"+1"`) and
   * 2 (human-readable text like `"All"` or `"Goblin"`) are readable as they
   * stand. Type 3 is an opaque numeric code (e.g. `"111"`) that is an
   * internal reference id, not a display value: the same skillMasterId can
   * appear with a type-2 readable value on one entry and a type-3 code on
   * another.
   */
  attributeType: z.number().int().optional(),
});

/**
 * A skill TP names DIRECTLY, with no id and no lookup. Only
 * `specialRuleName` (a star player's own exclusive skill, published as a
 * sibling of the `skills` array rather than an entry inside it) arrives this
 * way. It is merged into the same `skills` list so it is resolved and
 * category-checked down the existing starting-skill path, with no separate
 * pipeline; what marks it as exclusive is its curated `unique` category, not
 * this shape.
 */
export const TpOfficialSkillNameRefSchema = z.object({
  name: z.string().min(1),
});

/** One skill reference on an official-list entry, in one of two shapes. */
export const TpOfficialSkillRefSchema = z.union([
  TpOfficialSkillIdRefSchema,
  TpOfficialSkillNameRefSchema,
]);

/**
 * One entry on a race's official list: a regular position or a star player,
 * as packages/parse-tp reads it. TP's official team list publishes both with
 * the same five characteristics, so one shape covers both and `isStarPlayer`
 * is the only difference. This is what lets the importer take a single path
 * for regular and star positions alike.
 */
export const TpOfficialPositionSchema = z.object({
  name: z.string().min(1),
  isStarPlayer: z.boolean(),
  /**
   * TP's own numeric id for this position, when the official list carries
   * one. Registered as a TP external id by the importer, which is what keeps
   * a roster-embedded player resolvable: `TpPlayerPositionService` looks its
   * position up by `String(lineUpMasterId)`.
   */
  tpPositionId: z.number().int().optional(),
  characteristics: TpOfficialCharacteristicsSchema,
  skills: z.array(TpOfficialSkillRefSchema),
  /**
   * The keyword codes TP publishes for this position, merged from the three
   * fields it spreads them over: the `race` array (species codes; TP's name
   * for the field is not the team's race: a code is shared across positions
   * from unrelated team races, and a Zombie Lineman is Human, Zombie and
   * Undead together), the `positionTypes` bitmask (positional codes such as
   * Blitzer or Special) and the `isBigGuy` flag. Renamed so it cannot be
   * confused with this codebase's own `race`.
   *
   * Species codes are BB2025-only in practice: no other rules set's
   * downloaded data carries a non-empty `race` array. Positional codes and
   * Big Guy are not BB2025-exclusive: DB2021 publishes the full positional
   * set (via `positionTypes`) and BB2020 and DB2021 both publish `isBigGuy`,
   * so this field can be non-empty for those rules sets too.
   */
  keywordCodes: z.array(z.number().int()),
  /**
   * The categories the position may take skills from when it advances,
   * decoded from TP's `skillNormal` (primary) and `skillDouble` (secondary)
   * bitmasks. Both lists are empty for a star player, which cannot advance:
   * BB2020 publishes 0/0 for every star, and BB2025 omits both fields.
   * Required rather than defaulted, because an omitted field would sync every
   * position to an empty set and flag all its categories removed.
   */
  skillCategories: PositionSkillCategoriesSchema,
  /**
   * Set when the position's categories could not be read: a category listed
   * as both primary and secondary, which is corrupt source data. The message
   * names the roster and position. `skillCategories` is then empty and must
   * not be synced; the consumer reports the message as an error for this
   * position only and imports every other position normally.
   */
  skillCategoriesError: z.string().min(1).optional(),
});

/**
 * One race on TP's official team list for one rules set, as packages/parse-tp
 * reads it. `teamRaceCode` is TP's raw team-race code, which carries a
 * rules-set variant suffix and is NOT one-per-logical-race; `name` is the
 * display name, stable across every code variant of the same logical race.
 * Which rules set a parsed race belongs to is not in the payload: it is the
 * folder the file was read from, and the reader tags it.
 */
export const TpOfficialRaceSchema = z.object({
  name: z.string().min(1),
  teamRaceCode: z.string().min(1),
  /**
   * Whether this race came from an official (`teamRosterType === 0`) roster
   * rather than a legacy (`1`) one. Carried so a downstream consumer that
   * needs to prefer official data over legacy (e.g. packages/import-tp-live's
   * `TpOfficialPositionsUpsertService` characteristics conflict resolution)
   * does not have to re-derive it from `teamRosterType` itself.
   */
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
 * The stages `tpOfficialTeams.import` runs, in order, as named in its
 * `timings`.
 */
export const TpOfficialTeamsStageSchema = z.enum([
  'context',
  'races',
  'positions',
  'characteristics',
  'keywordCatalog',
  'keywords',
  'skillRefs',
  'startingSkills',
  'skillCategories',
]);

/** How long one stage of one `tpOfficialTeams.import` call took, in milliseconds. */
export const TpOfficialTeamsStageTimingSchema = z.object({
  stage: TpOfficialTeamsStageSchema,
  ms: z.number().nonnegative(),
});

/**
 * Output of `tpOfficialTeams.import`, one result per stage, plus every
 * imported position's characteristics under the rules set, which a caller
 * importing hired star players later needs as their template values, and
 * how long each stage that ran took. `timings` is optional so a result
 * without it still parses; a caller that does not report timings ignores it.
 */
export const TpOfficialTeamsImportResultSchema = z.object({
  races: ImportResultSchema,
  positions: ImportResultSchema,
  characteristics: ImportResultSchema,
  keywords: ImportResultSchema,
  startingSkills: ImportResultSchema,
  skillCategories: ImportResultSchema,
  positionCharacteristics: z.array(TpOfficialPositionCharacteristicsSchema),
  timings: z.array(TpOfficialTeamsStageTimingSchema).optional(),
});

export type TpOfficialCharacteristics = z.infer<
  typeof TpOfficialCharacteristicsSchema
>;
export type TpOfficialTeamsStage = z.infer<typeof TpOfficialTeamsStageSchema>;
export type TpOfficialTeamsStageTiming = z.infer<
  typeof TpOfficialTeamsStageTimingSchema
>;
export type TpOfficialSkillIdRef = z.infer<typeof TpOfficialSkillIdRefSchema>;
export type TpOfficialSkillNameRef = z.infer<
  typeof TpOfficialSkillNameRefSchema
>;
export type TpOfficialSkillRef = z.infer<typeof TpOfficialSkillRefSchema>;
export type TpOfficialPosition = z.infer<typeof TpOfficialPositionSchema>;
export type TpOfficialRace = z.infer<typeof TpOfficialRaceSchema>;
export type TpSkillMasterName = z.infer<typeof TpSkillMasterNameSchema>;
export type ImportTpOfficialTeams = z.infer<typeof ImportTpOfficialTeamsSchema>;
export type TpOfficialPositionCharacteristics = z.infer<
  typeof TpOfficialPositionCharacteristicsSchema
>;
export type TpOfficialTeamsImportResult = z.infer<
  typeof TpOfficialTeamsImportResultSchema
>;
