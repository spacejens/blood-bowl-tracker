import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { LeaguesService } from './leagues.service';
import { DB } from '@blood-bowl-tracker/db';

const fakeLeague = {
  id: 1,
  name: 'The Bad Cup',
  createdAt: new Date('2026-01-01'),
};

function makeFromBuilder(rows: unknown[]) {
  return {
    where: vi.fn().mockResolvedValue(rows),
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
    catch: (fn: (e: unknown) => unknown) => Promise.resolve(rows).catch(fn),
  };
}

describe('LeaguesService', () => {
  let service: LeaguesService;
  let mockDb: {
    select: () => { from: ReturnType<typeof vi.fn> };
    insert: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const selectChain = {
      from: vi.fn().mockReturnValue(makeFromBuilder([fakeLeague])),
    };
    const insertChain = {
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([fakeLeague]),
      })),
    };
    mockDb = {
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => insertChain),
    };

    const module = await Test.createTestingModule({
      providers: [LeaguesService, { provide: DB, useValue: mockDb }],
    }).compile();

    service = module.get(LeaguesService);
  });

  it('findAll returns a list of leagues', async () => {
    const result = await service.findAll();
    expect(result).toEqual([fakeLeague]);
  });

  it('findById returns the matching league', async () => {
    const result = await service.findById(1);
    expect(result).toEqual(fakeLeague);
  });

  it('findById returns undefined when not found', async () => {
    mockDb.select().from.mockReturnValue(makeFromBuilder([]));
    const result = await service.findById(999);
    expect(result).toBeUndefined();
  });

  it('create inserts and returns the new league', async () => {
    const result = await service.create({ name: 'The Bad Cup' });
    expect(result.name).toBe('The Bad Cup');
  });
});
