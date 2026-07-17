import type { AnyContractProcedure } from '@orpc/contract';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  upsertProcedure,
  upsertProcedureWithoutConflict,
} from './upsert-procedure';

const TestInputSchema = z.object({ name: z.string() });
const TestEntitySchema = z.object({ id: z.number(), name: z.string() });

function errorCodesOf(procedure: AnyContractProcedure): string[] {
  const errorMap = procedure['~orpc'].errorMap as Record<string, unknown>;
  return Object.keys(errorMap);
}

function outputShapeKeysOf(procedure: AnyContractProcedure): string[] {
  const outputSchema = procedure['~orpc'].outputSchema as {
    shape: Record<string, unknown>;
  };
  return Object.keys(outputSchema.shape);
}

describe('upsertProcedure', () => {
  it('declares exactly a CONFLICT error', () => {
    const procedure = upsertProcedure(TestInputSchema, TestEntitySchema);
    expect(errorCodesOf(procedure)).toEqual(['CONFLICT']);
  });

  it('extends the entity output with a created flag', () => {
    const procedure = upsertProcedure(TestInputSchema, TestEntitySchema);
    expect(outputShapeKeysOf(procedure)).toEqual(['id', 'name', 'created']);
  });
});

describe('upsertProcedureWithoutConflict', () => {
  it('declares no errors', () => {
    const procedure = upsertProcedureWithoutConflict(
      TestInputSchema,
      TestEntitySchema,
    );
    expect(errorCodesOf(procedure)).toEqual([]);
  });

  it('extends the entity output with a created flag', () => {
    const procedure = upsertProcedureWithoutConflict(
      TestInputSchema,
      TestEntitySchema,
    );
    expect(outputShapeKeysOf(procedure)).toEqual(['id', 'name', 'created']);
  });
});
