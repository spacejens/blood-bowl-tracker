import type { AnyContractProcedure } from '@orpc/contract';
import { describe, expect, it } from 'vitest';

import { resolveBatchProcedure, resolveProcedure } from './resolve-procedure';

function errorCodesOf(procedure: AnyContractProcedure): string[] {
  const errorMap = procedure['~orpc'].errorMap as Record<string, unknown>;
  return Object.keys(errorMap);
}

function inputSchemaOf(procedure: AnyContractProcedure) {
  return procedure['~orpc'].inputSchema as {
    parse: (value: unknown) => unknown;
  };
}

function outputSchemaOf(procedure: AnyContractProcedure) {
  return procedure['~orpc'].outputSchema as {
    parse: (value: unknown) => unknown;
  };
}

describe('resolveProcedure', () => {
  it('declares no contract errors, because a miss is a normal answer', () => {
    expect(errorCodesOf(resolveProcedure())).toEqual([]);
  });

  it('accepts a single external-id pair as input', () => {
    expect(
      inputSchemaOf(resolveProcedure()).parse({
        externalSystemId: 1,
        externalId: 'id:47',
      }),
    ).toEqual({ externalSystemId: 1, externalId: 'id:47' });
  });

  it('accepts a found result carrying the entity id', () => {
    expect(
      outputSchemaOf(resolveProcedure()).parse({ found: true, id: 9 }),
    ).toEqual({ found: true, id: 9 });
  });

  it('accepts a not-found result with no id', () => {
    expect(outputSchemaOf(resolveProcedure()).parse({ found: false })).toEqual({
      found: false,
    });
  });

  it('rejects a found result with no id', () => {
    expect(() =>
      outputSchemaOf(resolveProcedure()).parse({ found: true }),
    ).toThrow();
  });
});

describe('resolveBatchProcedure', () => {
  it('declares no contract errors', () => {
    expect(errorCodesOf(resolveBatchProcedure())).toEqual([]);
  });

  it('requires a non-empty input array', () => {
    expect(() => inputSchemaOf(resolveBatchProcedure()).parse([])).toThrow();
  });

  it('accepts a mixed array of found and not-found results', () => {
    expect(
      outputSchemaOf(resolveBatchProcedure()).parse([
        { found: true, id: 3 },
        { found: false },
      ]),
    ).toEqual([{ found: true, id: 3 }, { found: false }]);
  });
});
