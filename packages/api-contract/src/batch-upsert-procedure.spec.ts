import type {
  AnyContractProcedure,
  InferContractRouterOutputs,
} from '@orpc/contract';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';

import { batchUpsertProcedure } from './batch-upsert-procedure';

const TestInputSchema = z.object({ name: z.string() });
const TestEntitySchema = z.object({ id: z.number(), name: z.string() });

function errorCodesOf(procedure: AnyContractProcedure): string[] {
  const errorMap = procedure['~orpc'].errorMap as Record<string, unknown>;
  return Object.keys(errorMap);
}

function inputSchemaOf(procedure: AnyContractProcedure): z.ZodType {
  return procedure['~orpc'].inputSchema as z.ZodType;
}

function outputSchemaOf(procedure: AnyContractProcedure): z.ZodType {
  return procedure['~orpc'].outputSchema as z.ZodType;
}

describe('batchUpsertProcedure', () => {
  it('declares no contract errors (failures are per-item, not batch-level)', () => {
    const procedure = batchUpsertProcedure(TestInputSchema, TestEntitySchema);
    expect(errorCodesOf(procedure)).toEqual([]);
  });

  it('rejects an empty input array', () => {
    const procedure = batchUpsertProcedure(TestInputSchema, TestEntitySchema);
    expect(inputSchemaOf(procedure).safeParse([]).success).toBe(false);
  });

  it('accepts a non-empty input array', () => {
    const procedure = batchUpsertProcedure(TestInputSchema, TestEntitySchema);
    expect(
      inputSchemaOf(procedure).safeParse([{ name: 'a' }, { name: 'b' }])
        .success,
    ).toBe(true);
  });

  it('parses a mixed success/failure result array', () => {
    const procedure = batchUpsertProcedure(TestInputSchema, TestEntitySchema);
    const parsed = outputSchemaOf(procedure).safeParse([
      { success: true, id: 1, name: 'a', created: true },
      { success: false, error: 'External IDs matched multiple rows' },
    ]);
    expect(parsed.success).toBe(true);
  });

  it('rejects a success element missing the created flag', () => {
    const procedure = batchUpsertProcedure(TestInputSchema, TestEntitySchema);
    expect(
      outputSchemaOf(procedure).safeParse([{ success: true, id: 1, name: 'a' }])
        .success,
    ).toBe(false);
  });

  it('rejects a failure element missing the error message', () => {
    const procedure = batchUpsertProcedure(TestInputSchema, TestEntitySchema);
    expect(
      outputSchemaOf(procedure).safeParse([{ success: false }]).success,
    ).toBe(false);
  });

  // Same widening hazard `upsert-procedure.spec.ts` documents: applying
  // `.extend()` to a generic ZodObject inside a generic function has
  // previously widened the inferred shape to Record<string, unknown>.
  // `expectTypeOf` fails `pnpm typecheck` if that happens again (vitest does
  // not evaluate these assertions at runtime).
  it('preserves the precise per-item output type (type-level)', () => {
    const procedure = batchUpsertProcedure(TestInputSchema, TestEntitySchema);

    // Sanity-check `procedure` is a genuine value reference, not a type-only
    // import for eslint's sake.
    expect(errorCodesOf(procedure)).toEqual([]);

    type Output = InferContractRouterOutputs<typeof procedure>;
    expectTypeOf<Output>().toEqualTypeOf<
      (
        | { id: number; name: string; success: true; created: boolean }
        | { success: false; error: string }
      )[]
    >();
  });
});
