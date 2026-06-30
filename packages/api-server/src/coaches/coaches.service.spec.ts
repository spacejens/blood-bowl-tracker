import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { CoachesService } from './coaches.service';
import { DB } from '@blood-bowl-tracker/db';

const fakeCoach = {
  id: 1,
  name: 'Roze Madder',
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

describe('CoachesService', () => {
  let service: CoachesService;
  let mockDb: { select: ReturnType<typeof vi.fn>; insert: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    const selectChain = { from: vi.fn().mockReturnValue(makeFromBuilder([fakeCoach])) };
    const insertChain = {
      values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([fakeCoach]) })),
    };
    mockDb = {
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => insertChain),
    };

    const module = await Test.createTestingModule({
      providers: [CoachesService, { provide: DB, useValue: mockDb }],
    }).compile();

    service = module.get(CoachesService);
  });

  it('findAll returns a list of coaches', async () => {
    const result = await service.findAll();
    expect(result).toEqual([fakeCoach]);
  });

  it('findById returns the matching coach', async () => {
    const result = await service.findById(1);
    expect(result).toEqual(fakeCoach);
  });

  it('findById returns undefined when not found', async () => {
    (mockDb.select().from as ReturnType<typeof vi.fn>).mockReturnValue(
      makeFromBuilder([]),
    );
    const result = await service.findById(999);
    expect(result).toBeUndefined();
  });

  it('create inserts and returns the new coach', async () => {
    const result = await service.create({ name: 'Roze Madder' });
    expect(result.name).toBe('Roze Madder');
  });
});
