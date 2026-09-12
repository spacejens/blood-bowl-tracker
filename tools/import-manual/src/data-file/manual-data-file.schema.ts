import {
  CharacteristicFormatSchema,
  COMPETITION_TYPES,
  ExternalSystemCategorySchema,
  SppEarningActionTypeSchema,
  TrophyAwardRuleEventTypeSchema,
  TrophyAwardRuleKindSchema,
  TrophyAwardRuleMeasureSchema,
  TrophyAwardRuleRoleSchema,
  TrophyRecipientKindSchema,
} from '@blood-bowl-tracker/api-contract';
import { z } from 'zod';

/** An external-id pair, both in an entry's own externalIds and in a
 * cross-reference to another entry. `system` is an external system name;
 * `id` follows the id:/name: namespacing convention. */
const ExternalRefSchema = z.object({
  system: z.string().min(1),
  id: z.string().min(1),
});

const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date (YYYY-MM-DD)');

const externalIds = z.array(ExternalRefSchema).min(1);

const ExternalSystemEntrySchema = z.object({
  name: z.string().min(1),
  category: ExternalSystemCategorySchema,
});

/**
 * A rules set, plus the configuration saying which position characteristics
 * it has and how each is displayed. Each format is optional for the same
 * overlay reason every other entry field is: an entry that says nothing about
 * characteristics leaves the stored configuration alone. The database
 * defaults describe the older rules sets, so a rules set an importer creates
 * without curated formats is still valid — just not necessarily right, which
 * is why every rules set declared here states all five.
 */
const RulesSetEntrySchema = z.object({
  name: z.string().min(1),
  moveFormat: CharacteristicFormatSchema.optional(),
  strengthFormat: CharacteristicFormatSchema.optional(),
  agilityFormat: CharacteristicFormatSchema.optional(),
  passingFormat: CharacteristicFormatSchema.optional(),
  armourFormat: CharacteristicFormatSchema.optional(),
  externalIds,
});

const LeagueEntrySchema = z.object({
  name: z.string().min(1),
  externalIds,
});

const EraEntrySchema = z.object({
  name: z.string().min(1),
  league: ExternalRefSchema.optional(),
  rulesSets: z.array(ExternalRefSchema).default([]),
  startDate: IsoDate.optional(),
  endDate: IsoDate.nullable().optional(),
  externalIds,
});

const RaceEntrySchema = z.object({
  name: z.string().min(1),
  eras: z.array(ExternalRefSchema).default([]),
  externalIds,
});

const RaceEraRefSchema = z.object({
  race: ExternalRefSchema,
  era: ExternalRefSchema,
});

const PositionEntrySchema = z.object({
  name: z.string().min(1),
  isStarPlayer: z.boolean().optional(),
  raceEras: z.array(RaceEraRefSchema).default([]),
  externalIds,
});

/**
 * One position's characteristics under one rules set. `passing` is optional
 * because the three older rules sets have no Passing characteristic at all;
 * the processor sends an omitted value as an explicit null, which the API
 * validates against the rules set's declared passingFormat — supplying a
 * value a rules set does not have, or omitting one it requires, is rejected
 * there rather than silently stored.
 */
const PositionRulesSetEntrySchema = z.object({
  position: ExternalRefSchema,
  rulesSet: ExternalRefSchema,
  move: z.number().int(),
  strength: z.number().int(),
  agility: z.number().int(),
  passing: z.number().int().optional(),
  armour: z.number().int(),
});

const CoachEntrySchema = z.object({
  name: z.string().min(1),
  externalIds,
});

const TeamEntrySchema = z.object({
  name: z.string().min(1),
  race: ExternalRefSchema.optional(),
  coach: ExternalRefSchema.optional(),
  eras: z.array(ExternalRefSchema).default([]),
  externalIds,
});

/**
 * A competition belonging to at most one era. Every field except
 * `externalIds` is optional: the upsert overlays only what an entry
 * supplies, so a rename-only entry carries just the new name and the
 * external ids that match the existing row.
 */
const CompetitionEntrySchema = z.object({
  // Optional: most entries exist only to classify an already-imported
  // competition into its group, and restating a scraped name they do not
  // intend to change would risk renaming it by accident.
  name: z.string().min(1).optional(),
  type: z.enum(COMPETITION_TYPES).optional(),
  era: ExternalRefSchema.optional(),
  // competitions.start_date is NOT NULL with no default, so an entry that
  // creates a competition row -- which is exactly what
  // data/before-other-importers/competitions.json5 does, ahead of the BBL and
  // TP importers -- has to supply one. Both stay optional, and
  // endDate nullable, for the same overlay reason every other field here is:
  // a rename-only entry says nothing about dates and leaves the stored ones
  // alone.
  startDate: IsoDate.optional(),
  endDate: IsoDate.nullable().optional(),
  // An explicit external-id pair naming the competition group, in the same
  // synthetic "Name" system a group's own upsert registers itself under (e.g.
  // { system: 'Name', id: 'Major Season' }) -- resolved against the database
  // like any other cross-reference. Optional, so an entry that says nothing
  // about a group leaves the stored classification alone.
  competitionGroup: ExternalRefSchema.optional(),
  externalIds,
});

/**
 * One standardised SPP award. `race` is optional and its absence is
 * meaningful: an entry with no `race` is the rules set's baseline for that
 * action type, applying to every race with no more specific entry, while an
 * entry naming a race overrides that baseline for it.
 */
const SppAwardValueEntrySchema = z.object({
  rulesSet: ExternalRefSchema,
  race: ExternalRefSchema.optional(),
  actionType: SppEarningActionTypeSchema,
  sppValue: z.number().int(),
});

const TrophyEntrySchema = z.object({
  name: z.string().min(1),
  recipientKind: TrophyRecipientKindSchema,
  description: z.string().min(1).optional(),
  // An explicit external-id pair naming the competition group, in the same
  // synthetic "Name" system a group's own upsert registers itself under (e.g.
  // { system: 'Name', id: 'Major Season' }) -- resolved against the database
  // like any other cross-reference. Optional, so an entry that says nothing
  // about a group leaves the stored classification alone.
  competitionGroup: ExternalRefSchema.optional(),
  // The league this trophy is awarded across, when it is not tied to one
  // competition group -- a normal external-id cross-reference in the source
  // system's own namespace (e.g. { system: 'tloeg.bbleague.se', id: 'tLoEG' }),
  // the same convention competition-groups.json5 and eras.json5 use for a
  // league. Optional and mutually exclusive with `competitionGroup`; the
  // database's own check constraint is what enforces that exactly one is set.
  league: ExternalRefSchema.optional(),
  externalIds,
  // How this trophy's winner is determined. Required for every entry: a
  // trophy with no stated rule is an authoring gap, and the database's own
  // NOT NULL would reject it anyway.
  awardRuleKind: TrophyAwardRuleKindSchema,
  // Required for `direct_source`/`manual`, forbidden for the computed kinds.
  // Which combination is legal is enforced by the database's
  // `trophies_award_rule` check, not restated here.
  awardProcedure: z.string().min(1).optional(),
  awardRuleRole: TrophyAwardRuleRoleSchema.optional(),
  awardRuleTieCutoff: z.number().int().positive().optional(),
  awardRuleThreshold: z.number().int().positive().optional(),
  awardRuleMeasure: TrophyAwardRuleMeasureSchema.optional(),
  // Default `[]` rather than optional: an entry that says nothing about its
  // rule types really does have none, and letting the processor send `[]`
  // clears any stale rows from a previous classification.
  awardRuleMatchEventTypes: z.array(TrophyAwardRuleEventTypeSchema).default([]),
  awardRuleExcludedMatchEventTypes: z
    .array(TrophyAwardRuleEventTypeSchema)
    .default([]),
  // Which positions may win a computed trophy at all -- Bierhallenführer is
  // "the Ogre who...", so only the Ogre positions are eligible. Each entry is
  // a position's "Name"-system external id ("<raceName>: <positionName>", what
  // NameExternalIdService.forPosition builds), NOT an external-id
  // cross-reference: this file is read in the before-other-importers phase,
  // where no `positions` row exists yet for a reference to resolve against.
  // The ids are matched at award-computation time instead, when the positions
  // do exist. Default `[]` for the same reason the two arrays above have one:
  // an entry that says nothing restricts nothing, and sending `[]` clears any
  // stale rows from a previous classification.
  awardRuleEligiblePositions: z.array(z.string().min(1)).default([]),
});

/**
 * One curated competition group -- the recurring track a
 * competition instance belongs to. `league` is required and is a normal
 * external-id cross-reference, resolved against the database like any other
 * cross-reference, so the group only has to have been imported at some
 * point -- not necessarily by the same run or in the same directory as the
 * one declaring the leagues they name.
 *
 * A group declares no `externalIds` of its own: its id under the synthetic
 * "Name" system is derived in code from `name` (see
 * CompetitionGroupsProcessor), the same way BblLeaguesImportService derives a
 * league's, so there is nothing for a curator to keep in sync.
 */
const CompetitionGroupEntrySchema = z.object({
  name: z.string().min(1),
  league: ExternalRefSchema,
});

/**
 * One hand-curated trophy award: who won which trophy in which competition.
 * This exists only for trophies classified `manual` in
 * `before-other-importers/trophies.json5` — no statistic determines their
 * winner, so nothing can compute them and no source records them.
 *
 * `trophy` is the trophy's exact curated `name`, not an external-id
 * cross-reference: trophies carry no shared "Name"-system id (the same name
 * across competition tiers is genuinely a different trophy), and this file is
 * hand-authored alongside `trophies.json5` itself, so the curated name is the
 * identity a curator already has in front of them. A name no trophy carries
 * -- or one two trophies share -- is an authoring error that skips the entry.
 *
 * `competition` and `player` are ordinary external-id cross-references,
 * resolved against the database like every other reference in this tool.
 * Both name entities the BBL/TP importers create, which is why this file
 * lives in `after-other-importers/`.
 *
 * There is no `teamEra` reference and deliberately so: a player never changes
 * teams, so the award's team era is the winning player's own, and the API
 * derives it from the resolved player (see `UpsertTrophyAwardSchema`). Nor is
 * there a team-award variant -- both `manual` trophies are player trophies,
 * and a team award would have no player to derive a team era from.
 */
const TrophyAwardEntrySchema = z.object({
  trophy: z.string().min(1),
  competition: ExternalRefSchema,
  player: ExternalRefSchema,
});

export const ManualDataFileSchema = z
  .object({
    externalSystems: z.array(ExternalSystemEntrySchema).default([]),
    rulesSets: z.array(RulesSetEntrySchema).default([]),
    leagues: z.array(LeagueEntrySchema).default([]),
    eras: z.array(EraEntrySchema).default([]),
    races: z.array(RaceEntrySchema).default([]),
    positions: z.array(PositionEntrySchema).default([]),
    positionRulesSets: z.array(PositionRulesSetEntrySchema).default([]),
    coaches: z.array(CoachEntrySchema).default([]),
    teams: z.array(TeamEntrySchema).default([]),
    competitions: z.array(CompetitionEntrySchema).default([]),
    sppAwardValues: z.array(SppAwardValueEntrySchema).default([]),
    trophies: z.array(TrophyEntrySchema).default([]),
    competitionGroups: z.array(CompetitionGroupEntrySchema).default([]),
    trophyAwards: z.array(TrophyAwardEntrySchema).default([]),
  })
  .strict();

export type ExternalRef = z.infer<typeof ExternalRefSchema>;
export type PositionEntry = z.infer<typeof PositionEntrySchema>;
export type ManualDataFile = z.infer<typeof ManualDataFileSchema>;
