import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { RosterCopyPrecedenceService } from './roster-copy-precedence.service';

interface Copy {
  id: string;
  at: number | null;
}
const finishedAt = (copy: Copy) => copy.at;

describe('RosterCopyPrecedenceService', () => {
  let service: RosterCopyPrecedenceService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [RosterCopyPrecedenceService],
    }).compile();
    service = moduleRef.get(RosterCopyPrecedenceService);
  });

  it('picks the copy whose newest match finished last', () => {
    const copies = [
      { id: 'a', at: 1 },
      { id: 'b', at: 3 },
      { id: 'c', at: 2 },
    ];
    expect(service.newest({ copies, finishedAt, ties: 'first' })).toEqual([
      { id: 'b', at: 3 },
    ]);
  });

  it('counts a copy with no finish instant as older than any with one', () => {
    const copies = [
      { id: 'a', at: null },
      { id: 'b', at: 0 },
    ];
    expect(service.newest({ copies, finishedAt, ties: 'all' })).toEqual([
      { id: 'b', at: 0 },
    ]);
  });

  it('keeps the first seen on a tie under "first"', () => {
    const copies = [
      { id: 'a', at: 2 },
      { id: 'b', at: 2 },
    ];
    expect(service.newest({ copies, finishedAt, ties: 'first' })).toEqual([
      { id: 'a', at: 2 },
    ]);
  });

  it('keeps every tied copy under "all", nulls included', () => {
    const copies = [
      { id: 'a', at: null },
      { id: 'b', at: null },
    ];
    expect(service.newest({ copies, finishedAt, ties: 'all' })).toEqual(copies);
  });

  it('returns nothing for no copies', () => {
    expect(
      service.newest<Copy>({ copies: [], finishedAt, ties: 'first' }),
    ).toEqual([]);
  });
});
