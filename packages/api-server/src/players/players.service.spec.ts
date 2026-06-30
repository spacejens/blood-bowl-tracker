import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { PlayersService } from './players.service';
import { DB } from '@blood-bowl-tracker/db';

const fakePlayer = {
  id: 1,
  name: 'Grak',
  teamId: 1,
  positionId: 1,
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

describe('PlayersService', () => {
  let service: PlayersService;
  let mockDb: { select: ReturnType<typeof vi.fn>; insert: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    const selectChain = { from: vi.fn().mockReturnValue(makeFromBuilder([fakePlayer])) };
    const insertChain = {
      values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([fakePlayer]) })),
    };
    mockDb = {
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => insertChain),
    };

    const module = await Test.createTestingModule({
      providers: [PlayersService, { provide: DB, useValue: mockDb }],
    }).compile();

    service = module.get(PlayersService);
  });

  it('findAll returns a list of players', async () => {
    const result = await service.findAll();
    expect(result).toEqual([fakePlayer]);
  });

  it('findById returns the matching player', async () => {
    const result = await service.findById(1);
    expect(result).toEqual(fakePlayer);
  });

  it('findById returns undefined when not found', async () => {
    (mockDb.select().from as ReturnType<typeof vi.fn>).mockReturnValue(
      makeFromBuilder([]),
    );
    const result = await service.findById(999);
    expect(result).toBeUndefined();
  });

  it('create inserts and returns the new player', async () => {
    const result = await service.create({ name: 'Grak', teamId: 1, positionId: 1 });
    expect(result.name).toBe('Grak');
    expect(result.teamId).toBe(1);
  });
});
