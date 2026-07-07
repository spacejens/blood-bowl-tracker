import { oc } from '@orpc/contract';
import { z } from 'zod';
import { CoachSchema, UpsertCoachSchema } from './schemas/coach';
import {
  ExternalSystemSchema,
  UpsertExternalSystemSchema,
} from './schemas/external-system';

export const contract = {
  coaches: {
    upsert: oc
      .input(UpsertCoachSchema)
      .errors({ CONFLICT: { message: 'Conflicting external IDs' } })
      .output(CoachSchema.extend({ created: z.boolean() })),
  },
  externalSystems: {
    upsert: oc
      .input(UpsertExternalSystemSchema)
      .output(ExternalSystemSchema.extend({ created: z.boolean() })),
  },
};
