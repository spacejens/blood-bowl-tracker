import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { ExternalSystemsService } from './external-systems.service';
import { DB } from '@blood-bowl-tracker/db';

const fakeSystem = {
  id: 1,
  name: 'BBL',
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

describe('ExternalSystemsService', () => {
  let service: ExternalSystemsService;
  let mockDb: {
    select: () => { from: ReturnType<typeof vi.fn> };
    insert: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const selectChain = {
      from: vi.fn().mockReturnValue(makeFromBuilder([fakeSystem])),
    };
    const insertChain = {
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([fakeSystem]),
      })),
    };
    mockDb = {
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => insertChain),
    };

    const module = await Test.createTestingModule({
      providers: [ExternalSystemsService, { provide: DB, useValue: mockDb }],
    }).compile();

    service = module.get(ExternalSystemsService);
  });

  it('findAll returns a list of external systems', async () => {
    const result = await service.findAll();
    expect(result).toEqual([fakeSystem]);
  });

  it('findById returns the matching external system', async () => {
    const result = await service.findById(1);
    expect(result).toEqual(fakeSystem);
  });

  it('findById returns undefined when not found', async () => {
    mockDb.select().from.mockReturnValue(makeFromBuilder([]));
    const result = await service.findById(999);
    expect(result).toBeUndefined();
  });

  it('create inserts and returns the new external system', async () => {
    const result = await service.create({ name: 'BBL' });
    expect(result.name).toBe('BBL');
  });

  it('upsert returns the existing system without inserting when name matches', async () => {
    mockDb.select().from.mockReturnValue(makeFromBuilder([fakeSystem]));
    const result = await service.upsert({ name: 'BBL' });
    expect(result).toEqual({ system: fakeSystem, created: false });
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it('upsert creates a new system when no name matches', async () => {
    mockDb.select().from.mockReturnValue(makeFromBuilder([]));
    const result = await service.upsert({ name: 'NAF' });
    expect(result).toEqual({ system: fakeSystem, created: true });
    expect(mockDb.insert).toHaveBeenCalled();
  });
});
