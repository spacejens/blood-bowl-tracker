import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { BatchContentHashService } from './batch-content-hash.service';

describe('BatchContentHashService', () => {
  let service: BatchContentHashService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [BatchContentHashService],
    }).compile();
    service = moduleRef.get(BatchContentHashService);
  });

  const bob = { name: 'Bob', externalIds: [{ system: 'Name', id: 'Bob' }] };

  it('hashes the canonical JSON with SHA-256', () => {
    // Pinned: the ledger on every long-lived database stores hashes computed
    // this way, so changing the canonical form would make every applied batch
    // look edited.
    expect(service.hash({ coaches: [bob] })).toBe(
      'dafe9bc7621cf23ea0b34fd6d4b40563064da3db74c5daa77a926cecc584f61e',
    );
  });

  it('ignores object key order at every depth', () => {
    expect(
      service.hash({
        coaches: [
          { externalIds: [{ id: 'Bob', system: 'Name' }], name: 'Bob' },
        ],
      }),
    ).toBe(service.hash({ coaches: [bob] }));
  });

  it('ignores empty sections', () => {
    expect(service.hash({ coaches: [bob], teams: [] })).toBe(
      service.hash({ coaches: [bob] }),
    );
    expect(service.hash({})).toBe(
      '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a',
    );
  });

  it('changes when a value changes', () => {
    expect(service.hash({ coaches: [{ ...bob, name: 'Robert' }] })).not.toBe(
      service.hash({ coaches: [bob] }),
    );
  });

  it('changes when entries are reordered', () => {
    const sue = { name: 'Sue', externalIds: [{ system: 'Name', id: 'Sue' }] };
    expect(service.hash({ coaches: [bob, sue] })).not.toBe(
      service.hash({ coaches: [sue, bob] }),
    );
  });
});
