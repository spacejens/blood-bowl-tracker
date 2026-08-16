import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ExternalIdResolverService } from './external-id-resolver.service';
import { ImportResultService } from './import-result.service';
import { ReferenceLookupService } from './reference-lookup.service';
import type { ImportError } from './types';

const ref = { externalSystemId: 1, externalId: 'id:47' };
const other = { externalSystemId: 1, externalId: 'id:48' };

describe('ReferenceLookupService', () => {
  let service: ReferenceLookupService;
  let resolver: MockProxy<ExternalIdResolverService>;
  let importResults: MockProxy<ImportResultService>;
  let errors: ImportError[];

  beforeEach(async () => {
    resolver = mock<ExternalIdResolverService>();
    importResults = mock<ImportResultService>();
    importResults.error.mockImplementation((args) => ({
      item: args.item,
      message: args.message,
    }));
    errors = [];
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReferenceLookupService,
        { provide: ExternalIdResolverService, useValue: resolver },
        { provide: ImportResultService, useValue: importResults },
      ],
    }).compile();
    service = moduleRef.get(ReferenceLookupService);
  });

  it('returns the resolved id and records nothing on a hit', async () => {
    resolver.resolve.mockResolvedValue(9);

    await expect(
      service.lookup({ kind: 'race', ref, errors, item: { a: 1 }, label: 'L' }),
    ).resolves.toBe(9);
    expect(errors).toEqual([]);
  });

  it('records one error and returns undefined on a miss', async () => {
    resolver.resolve.mockResolvedValue(undefined);

    await expect(
      service.lookup({ kind: 'race', ref, errors, item: { a: 1 }, label: 'L' }),
    ).resolves.toBeUndefined();
    expect(errors).toEqual([
      { item: { a: 1 }, message: 'L: could not resolve reference 1|id:47.' },
    ]);
  });

  it('returns every id in order when a whole list resolves', async () => {
    resolver.resolveBatch.mockResolvedValue([9, 10]);

    await expect(
      service.lookupMany({
        kind: 'era',
        refs: [ref, other],
        errors,
        item: {},
        label: 'L',
      }),
    ).resolves.toEqual([9, 10]);
    expect(errors).toEqual([]);
  });

  it('records one error per unresolved ref and returns undefined', async () => {
    resolver.resolveBatch.mockResolvedValue([undefined, undefined]);

    await expect(
      service.lookupMany({
        kind: 'era',
        refs: [ref, other],
        errors,
        item: {},
        label: 'L',
      }),
    ).resolves.toBeUndefined();
    expect(errors).toEqual([
      { item: {}, message: 'L: could not resolve reference 1|id:47.' },
      { item: {}, message: 'L: could not resolve reference 1|id:48.' },
    ]);
  });

  it('returns an empty list for no refs without asking the resolver', async () => {
    await expect(
      service.lookupMany({
        kind: 'era',
        refs: [],
        errors,
        item: {},
        label: 'L',
      }),
    ).resolves.toEqual([]);
    expect(resolver.resolveBatch).not.toHaveBeenCalled();
  });

  it('builds a lookup map of only the refs that resolved', async () => {
    resolver.resolveBatch.mockResolvedValue([9, undefined]);

    const map = await service.lookupMap('race', [ref, other]);

    expect(map.get(service.keyOf(ref))).toBe(9);
    expect(map.has(service.keyOf(other))).toBe(false);
  });

  it('de-duplicates repeated refs before asking the resolver', async () => {
    resolver.resolveBatch.mockResolvedValue([9]);

    const map = await service.lookupMap('race', [ref, ref]);

    expect(resolver.resolveBatch).toHaveBeenCalledWith('race', [ref]);
    expect(map.get(service.keyOf(ref))).toBe(9);
  });

  it('returns an empty map for no refs without asking the resolver', async () => {
    await expect(service.lookupMap('race', [])).resolves.toEqual(new Map());
    expect(resolver.resolveBatch).not.toHaveBeenCalled();
  });
});
