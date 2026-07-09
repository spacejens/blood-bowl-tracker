import { oc } from '@orpc/contract';
import { z } from 'zod';

import { CoachSchema, UpsertCoachSchema } from './schemas/coach';
import { EraSchema, UpsertEraSchema } from './schemas/era';
import {
  ExternalSystemSchema,
  UpsertExternalSystemSchema,
} from './schemas/external-system';
import { LeagueSchema, UpsertLeagueSchema } from './schemas/league';
import { RaceSchema, UpsertRaceSchema } from './schemas/race';
import { RulesSetSchema, UpsertRulesSetSchema } from './schemas/rules-set';

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
  externalSystems: {
    upsert: oc
      .input(UpsertExternalSystemSchema)
      .output(ExternalSystemSchema.extend({ created: z.boolean() })),
  },
};
