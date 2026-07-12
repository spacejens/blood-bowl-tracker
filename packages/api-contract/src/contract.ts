import { oc } from '@orpc/contract';
import { z } from 'zod';

import { CoachSchema, UpsertCoachSchema } from './schemas/coach';
import {
  CompetitionSchema,
  UpsertCompetitionSchema,
} from './schemas/competition';
import { EraSchema, UpsertEraSchema } from './schemas/era';
import {
  ExternalSystemSchema,
  UpsertExternalSystemSchema,
} from './schemas/external-system';
import { LeagueSchema, UpsertLeagueSchema } from './schemas/league';
import { MatchSchema, UpsertMatchSchema } from './schemas/match';
import { PlayerSchema, UpsertPlayerSchema } from './schemas/player';
import { PositionSchema, UpsertPositionSchema } from './schemas/position';
import { RaceSchema, UpsertRaceSchema } from './schemas/race';
import { RulesSetSchema, UpsertRulesSetSchema } from './schemas/rules-set';
import { TeamSchema, UpsertTeamSchema } from './schemas/team';

export const contract = {
  coaches: {
    upsert: oc
      .input(UpsertCoachSchema)
      .errors({ CONFLICT: { message: 'Conflicting external IDs' } })
      .output(CoachSchema.extend({ created: z.boolean() })),
  },
  leagues: {
    upsert: oc
      .input(UpsertLeagueSchema)
      .errors({ CONFLICT: { message: 'Conflicting external IDs' } })
      .output(LeagueSchema.extend({ created: z.boolean() })),
  },
  races: {
    upsert: oc
      .input(UpsertRaceSchema)
      .errors({ CONFLICT: { message: 'Conflicting external IDs' } })
      .output(RaceSchema.extend({ created: z.boolean() })),
  },
  players: {
    upsert: oc
      .input(UpsertPlayerSchema)
      .errors({ CONFLICT: { message: 'Conflicting external IDs' } })
      .output(PlayerSchema.extend({ created: z.boolean() })),
  },
  positions: {
    upsert: oc
      .input(UpsertPositionSchema)
      .errors({ CONFLICT: { message: 'Conflicting external IDs' } })
      .output(PositionSchema.extend({ created: z.boolean() })),
  },
  rulesSets: {
    upsert: oc
      .input(UpsertRulesSetSchema)
      .errors({ CONFLICT: { message: 'Conflicting external IDs' } })
      .output(RulesSetSchema.extend({ created: z.boolean() })),
  },
  eras: {
    upsert: oc
      .input(UpsertEraSchema)
      .errors({ CONFLICT: { message: 'Conflicting external IDs' } })
      .output(EraSchema.extend({ created: z.boolean() })),
  },
  competitions: {
    upsert: oc
      .input(UpsertCompetitionSchema)
      .errors({ CONFLICT: { message: 'Conflicting external IDs' } })
      .output(CompetitionSchema.extend({ created: z.boolean() })),
  },
  matches: {
    upsert: oc
      .input(UpsertMatchSchema)
      .errors({ CONFLICT: { message: 'Conflicting external IDs' } })
      .output(MatchSchema.extend({ created: z.boolean() })),
  },
  teams: {
    upsert: oc
      .input(UpsertTeamSchema)
      .errors({ CONFLICT: { message: 'Conflicting external IDs' } })
      .output(TeamSchema.extend({ created: z.boolean() })),
  },
  externalSystems: {
    upsert: oc
      .input(UpsertExternalSystemSchema)
      .output(ExternalSystemSchema.extend({ created: z.boolean() })),
  },
};
