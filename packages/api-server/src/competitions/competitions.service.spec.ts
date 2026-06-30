import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { CompetitionsService } from './competitions.service';
import { DB } from '@blood-bowl-tracker/db';

const fakeCompetition = {
  id: 1,
  name: 'Spring Season',
  type: 'season' as const,
  eraId: 1,
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

describe('CompetitionsService', () => {
  let service: CompetitionsService;
  let mockDb: {
    select: () => { from: ReturnType<typeof vi.fn> };
    insert: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const selectChain = {
      from: vi.fn().mockReturnValue(makeFromBuilder([fakeCompetition])),
    };
    const insertChain = {
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([fakeCompetition]),
      })),
    };
    mockDb = {
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => insertChain),
    };

    const module = await Test.createTestingModule({
      providers: [CompetitionsService, { provide: DB, useValue: mockDb }],
    }).compile();

    service = module.get(CompetitionsService);
  });

  it('findAll returns a list of competitions', async () => {
    const result = await service.findAll();
    expect(result).toEqual([fakeCompetition]);
  });

  it('findById returns the matching competition', async () => {
    const result = await service.findById(1);
    expect(result).toEqual(fakeCompetition);
  });

  it('findById returns undefined when not found', async () => {
    mockDb.select().from.mockReturnValue(makeFromBuilder([]));
    const result = await service.findById(999);
    expect(result).toBeUndefined();
  });

  it('create inserts and returns the new competition', async () => {
    const result = await service.create({
      name: 'Spring Season',
      type: 'season',
      eraId: 1,
    });
    expect(result.name).toBe('Spring Season');
    expect(result.type).toBe('season');
  });
});
