import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ExternalIdResolverService } from './external-id-resolver.service';
import { ImportResultService } from './import-result.service';
import { ReferenceLookupService } from './reference-lookup.service';

const ref = { externalSystemId: 1, externalId: 'id:47' };
const other = { externalSystemId: 1, externalId: 'id:48' };

describe('ReferenceLookupService', () => {
  let service: ReferenceLookupService;
  let resolver: MockProxy<ExternalIdResolverService>;
  let importResults: MockProxy<ImportResultService>;

  beforeEach(async () => {
    resolver = mock<ExternalIdResolverService>();
    importResults = mock<ImportResultService>();
    importResults.error.mockImplementation((args) => ({
      item: args.item,
      message: args.message,
    }));
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReferenceLookupService,
        { provide: ExternalIdResolverService, useValue: resolver },
        { provide: ImportResultService, useValue: importResults },
      ],
    }).compile();
    service = moduleRef.get(ReferenceLookupService);
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

  it('returns an empty map instead of throwing when the RPC call fails', async () => {
    resolver.resolveBatch.mockRejectedValue(new Error('network blip'));
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    await expect(service.lookupMap('race', [ref, other])).resolves.toEqual(
      new Map(),
    );
    expect(importResults.error).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('network blip') as string,
      }),
    );
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });
});
