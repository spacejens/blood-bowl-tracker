import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { PositionsService } from './positions.service';
import { DB } from '@blood-bowl-tracker/db';

const fakePosition = {
  id: 1,
  name: 'Blitzer',
  raceId: 1,
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

describe('PositionsService', () => {
  let service: PositionsService;
  let mockDb: {
    select: () => { from: ReturnType<typeof vi.fn> };
    insert: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const selectChain = {
      from: vi.fn().mockReturnValue(makeFromBuilder([fakePosition])),
    };
    const insertChain = {
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([fakePosition]),
      })),
    };
    mockDb = {
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => insertChain),
    };

    const module = await Test.createTestingModule({
      providers: [PositionsService, { provide: DB, useValue: mockDb }],
    }).compile();

    service = module.get(PositionsService);
  });

  it('findAll returns a list of positions', async () => {
    const result = await service.findAll();
    expect(result).toEqual([fakePosition]);
  });

  it('findById returns the matching position', async () => {
    const result = await service.findById(1);
    expect(result).toEqual(fakePosition);
  });

  it('findById returns undefined when not found', async () => {
    mockDb.select().from.mockReturnValue(makeFromBuilder([]));
    const result = await service.findById(999);
    expect(result).toBeUndefined();
  });

  it('create inserts and returns the new position', async () => {
    const result = await service.create({ name: 'Blitzer', raceId: 1 });
    expect(result.name).toBe('Blitzer');
    expect(result.raceId).toBe(1);
  });
});
