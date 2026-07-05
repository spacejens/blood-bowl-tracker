import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { MatchesService } from './matches.service';
import { DB } from '@blood-bowl-tracker/db';

const fakeMatch = {
  id: 1,
  competitionId: 1,
  playedAt: new Date('2026-01-15'),
  createdAt: new Date('2026-01-15'),
};

describe('MatchesService', () => {
  let service: MatchesService;
  let mockDb: {
    select: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    const selectChain = {
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([fakeMatch]),
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve([fakeMatch]).then(resolve),
      }),
    };
    const insertChain = {
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([fakeMatch]),
      })),
    };
    mockDb = {
      select: vi.fn(() => selectChain),
      insert: vi.fn(() => insertChain),
    };

    const module = await Test.createTestingModule({
      providers: [MatchesService, { provide: DB, useValue: mockDb }],
    }).compile();

    service = module.get(MatchesService);
  });

  it('findAll returns a list of matches', async () => {
    const result = await service.findAll();
    expect(result).toEqual([fakeMatch]);
  });

  it('findById returns the matching match', async () => {
    const result = await service.findById(1);
    expect(result).toEqual(fakeMatch);
  });

  it('create inserts and returns the new match', async () => {
    const result = await service.create({
      competitionId: 1,
      playedAt: new Date('2026-01-15'),
    });
    expect(result.competitionId).toBe(1);
  });
});
