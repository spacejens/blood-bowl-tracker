import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { ErasService } from './eras.service';
import { DB } from '@blood-bowl-tracker/db';

const fakeEra = {
  id: 1,
  name: 'Spring 2026',
  leagueId: 1,
  rulesSetId: 1,
  startDate: '2026-01-01',
  endDate: null,
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

describe('ErasService', () => {
  let service: ErasService;
  let mockDb: {
    select: () => { from: ReturnType<typeof vi.fn> };
    insert: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const selectChain = {
      from: vi.fn().mockReturnValue(makeFromBuilder([fakeEra])),
    };
    const insertChain = {
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([fakeEra]),
      })),
    };
    mockDb = {
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => insertChain),
    };

    const module = await Test.createTestingModule({
      providers: [ErasService, { provide: DB, useValue: mockDb }],
    }).compile();

    service = module.get(ErasService);
  });

  it('findAll returns a list of eras', async () => {
    const result = await service.findAll();
    expect(result).toEqual([fakeEra]);
  });

  it('findById returns the matching era', async () => {
    const result = await service.findById(1);
    expect(result).toEqual(fakeEra);
  });

  it('findById returns undefined when not found', async () => {
    mockDb.select().from.mockReturnValue(makeFromBuilder([]));
    const result = await service.findById(999);
    expect(result).toBeUndefined();
  });

  it('create inserts and returns the new era', async () => {
    const result = await service.create({
      name: 'Spring 2026',
      leagueId: 1,
      rulesSetId: 1,
      startDate: '2026-01-01',
    });
    expect(result.name).toBe('Spring 2026');
    expect(result.leagueId).toBe(1);
  });
});
