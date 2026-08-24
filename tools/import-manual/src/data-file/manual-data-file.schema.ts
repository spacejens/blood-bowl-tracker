import {
  ExternalSystemCategorySchema,
  SppEarningActionTypeSchema,
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

const RulesSetEntrySchema = z.object({
  name: z.string().min(1),
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
  type: z.enum(['season', 'cup']).optional(),
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

/**
 * One curated trophy. Unlike every other entity section, `externalIds` is
 * NOT `.min(1)` and defaults to `[]`: a trophy may genuinely have none yet
 * (the TP-only "Ogretoberfest" has no BBL equivalent, and TP's own
 * `awardType` codes are not globally unique per trophy, so they cannot be
 * seeded until a competition-classification concept exists). Such a trophy
 * is matched on its exact name instead, by
 * `TrophiesService.upsert`, so re-running the import never duplicates it.
 */
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
  externalIds: z.array(ExternalRefSchema).default([]),
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

export const ManualDataFileSchema = z
  .object({
    externalSystems: z.array(ExternalSystemEntrySchema).default([]),
    rulesSets: z.array(RulesSetEntrySchema).default([]),
    leagues: z.array(LeagueEntrySchema).default([]),
    eras: z.array(EraEntrySchema).default([]),
    races: z.array(RaceEntrySchema).default([]),
    positions: z.array(PositionEntrySchema).default([]),
    coaches: z.array(CoachEntrySchema).default([]),
    teams: z.array(TeamEntrySchema).default([]),
    competitions: z.array(CompetitionEntrySchema).default([]),
    sppAwardValues: z.array(SppAwardValueEntrySchema).default([]),
    trophies: z.array(TrophyEntrySchema).default([]),
    competitionGroups: z.array(CompetitionGroupEntrySchema).default([]),
  })
  .strict();

export type ExternalRef = z.infer<typeof ExternalRefSchema>;
export type PositionEntry = z.infer<typeof PositionEntrySchema>;
export type ManualDataFile = z.infer<typeof ManualDataFileSchema>;
