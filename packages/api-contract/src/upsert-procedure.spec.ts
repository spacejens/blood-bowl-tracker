import type {
  AnyContractProcedure,
  InferContractRouterOutputs,
} from '@orpc/contract';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

import {
  upsertProcedure,
  upsertProcedureBadRequestOnly,
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
  it('declares exactly a CONFLICT and a BAD_REQUEST error', () => {
    const procedure = upsertProcedure(TestInputSchema, TestEntitySchema);
    expect(errorCodesOf(procedure)).toEqual(['CONFLICT', 'BAD_REQUEST']);
  });

  it('extends the entity output with a created flag', () => {
    const procedure = upsertProcedure(TestInputSchema, TestEntitySchema);
    expect(outputShapeKeysOf(procedure)).toEqual(['id', 'name', 'created']);
  });

  // Applying `.extend()` to a generic ZodObject inside a generic function
  // can make TypeScript widen the inferred output schema's shape to
  // `Record<string, unknown>` if the generic bound is not tight enough.
  // `expectTypeOf` fails `pnpm typecheck` if that widening occurs (vitest's
  // runtime execution does not evaluate these assertions on its own).
  it('preserves the precise output schema shape (type-level)', () => {
    const procedure = upsertProcedure(TestInputSchema, TestEntitySchema);

    // Sanity-check `procedure` is a genuine value reference, not just a
    // type-only import for eslint's sake.
    expect(outputShapeKeysOf(procedure)).toEqual(['id', 'name', 'created']);

    type Output = InferContractRouterOutputs<typeof procedure>;
    expectTypeOf<Output>().toEqualTypeOf<{
      id: number;
      name: string;
      created: boolean;
    }>();
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

  it('preserves the precise output schema shape (type-level)', () => {
    const procedure = upsertProcedureWithoutConflict(
      TestInputSchema,
      TestEntitySchema,
    );

    // Sanity-check `procedure` is a genuine value reference, not just a
    // type-only import for eslint's sake.
    expect(outputShapeKeysOf(procedure)).toEqual(['id', 'name', 'created']);

    type Output = InferContractRouterOutputs<typeof procedure>;
    expectTypeOf<Output>().toEqualTypeOf<{
      id: number;
      name: string;
      created: boolean;
    }>();
  });
});

describe('upsertProcedureBadRequestOnly', () => {
  it('declares exactly a BAD_REQUEST error', () => {
    const procedure = upsertProcedureBadRequestOnly(
      TestInputSchema,
      TestEntitySchema,
    );
    expect(errorCodesOf(procedure)).toEqual(['BAD_REQUEST']);
  });

  it('extends the entity output with a created flag', () => {
    const procedure = upsertProcedureBadRequestOnly(
      TestInputSchema,
      TestEntitySchema,
    );
    expect(outputShapeKeysOf(procedure)).toEqual(['id', 'name', 'created']);
  });

  it('preserves the precise output schema shape (type-level)', () => {
    const procedure = upsertProcedureBadRequestOnly(
      TestInputSchema,
      TestEntitySchema,
    );

    // Sanity-check `procedure` is a genuine value reference, not just a
    // type-only import for eslint's sake.
    expect(outputShapeKeysOf(procedure)).toEqual(['id', 'name', 'created']);

    type Output = InferContractRouterOutputs<typeof procedure>;
    expectTypeOf<Output>().toEqualTypeOf<{
      id: number;
      name: string;
      created: boolean;
    }>();
  });
});
