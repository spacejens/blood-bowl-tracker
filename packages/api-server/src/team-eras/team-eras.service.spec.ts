import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { TeamErasService } from './team-eras.service';
import { DB } from '@blood-bowl-tracker/db';

const fakeTeamEra = {
  id: 1,
  teamId: 1,
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

describe('TeamErasService', () => {
  let service: TeamErasService;
  let mockDb: {
    select: () => { from: ReturnType<typeof vi.fn> };
    insert: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const selectChain = {
      from: vi.fn().mockReturnValue(makeFromBuilder([fakeTeamEra])),
    };
    const insertChain = {
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([fakeTeamEra]),
      })),
    };
    mockDb = {
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => insertChain),
    };

    const module = await Test.createTestingModule({
      providers: [TeamErasService, { provide: DB, useValue: mockDb }],
    }).compile();

    service = module.get(TeamErasService);
  });

  it('findAll returns a list of team eras', async () => {
    const result = await service.findAll();
    expect(result).toEqual([fakeTeamEra]);
  });

  it('findById returns the matching team era', async () => {
    const result = await service.findById(1);
    expect(result).toEqual(fakeTeamEra);
  });

  it('findById returns undefined when not found', async () => {
    mockDb.select().from.mockReturnValue(makeFromBuilder([]));
    const result = await service.findById(999);
    expect(result).toBeUndefined();
  });

  it('create inserts and returns the new team era', async () => {
    const result = await service.create({ teamId: 1, eraId: 1 });
    expect(result.teamId).toBe(1);
    expect(result.eraId).toBe(1);
  });
});
