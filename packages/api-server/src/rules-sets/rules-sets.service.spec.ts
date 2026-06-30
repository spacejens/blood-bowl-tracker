import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { RulesSetsService } from './rules-sets.service';
import { DB } from '@blood-bowl-tracker/db';

const fakeRulesSet = {
  id: 1,
  name: 'Blood Bowl 2020',
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

describe('RulesSetsService', () => {
  let service: RulesSetsService;
  let mockDb: { select: ReturnType<typeof vi.fn>; insert: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    const selectChain = { from: vi.fn().mockReturnValue(makeFromBuilder([fakeRulesSet])) };
    const insertChain = {
      values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([fakeRulesSet]) })),
    };
    mockDb = {
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => insertChain),
    };

    const module = await Test.createTestingModule({
      providers: [RulesSetsService, { provide: DB, useValue: mockDb }],
    }).compile();

    service = module.get(RulesSetsService);
  });

  it('findAll returns a list of rules sets', async () => {
    const result = await service.findAll();
    expect(result).toEqual([fakeRulesSet]);
  });

  it('findById returns the matching rules set', async () => {
    const result = await service.findById(1);
    expect(result).toEqual(fakeRulesSet);
  });

  it('findById returns undefined when not found', async () => {
    (mockDb.select().from as ReturnType<typeof vi.fn>).mockReturnValue(
      makeFromBuilder([]),
    );
    const result = await service.findById(999);
    expect(result).toBeUndefined();
  });

  it('create inserts and returns the new rules set', async () => {
    const result = await service.create({ name: 'Blood Bowl 2020' });
    expect(result.name).toBe('Blood Bowl 2020');
  });
});
