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
  league: ExternalRefSchema,
  rulesSets: z.array(ExternalRefSchema).min(1),
  startDate: IsoDate,
  endDate: IsoDate.optional(),
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
  isStarPlayer: z.boolean(),
  raceEras: z.array(RaceEraRefSchema).default([]),
  externalIds,
});

const CoachEntrySchema = z.object({
  name: z.string().min(1),
  externalIds,
});

const TeamEntrySchema = z.object({
  name: z.string().min(1),
  race: ExternalRefSchema,
  coach: ExternalRefSchema,
  eras: z.array(ExternalRefSchema).default([]),
  externalIds,
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
  })
  .strict();

export type ExternalRef = z.infer<typeof ExternalRefSchema>;
export type PositionEntry = z.infer<typeof PositionEntrySchema>;
export type ManualDataFile = z.infer<typeof ManualDataFileSchema>;
