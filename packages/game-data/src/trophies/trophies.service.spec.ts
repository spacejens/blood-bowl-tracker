import type { Db } from '@blood-bowl-tracker/db';
import { DB, trophies } from '@blood-bowl-tracker/db';
import type {
  QueryChain,
  QueryOutcome,
} from '@blood-bowl-tracker/db/test-helpers';
import {
  extractFilterValues,
  firstCallArg,
  mockDb,
  sqlText,
} from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TrophiesService, TrophyUpsertConflictError } from './trophies.service';
import { TrophyRuleCurationSyncService } from './trophy-rule-curation-sync.service';

const fakeTrophy = {
  id: 1,
  name: 'Chaos Cup',
  recipientKind: 'team' as const,
  description: 'The team that wins after four matches.',
  createdAt: new Date('2026-01-01'),
};

describe('TrophiesService', () => {
  let service: TrophiesService;
  let ruleCurationSync: MockProxy<TrophyRuleCurationSyncService>;

  async function build(...rowsPerQuery: QueryOutcome[]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [
        TrophiesService,
        { provide: TrophyRuleCurationSyncService, useValue: ruleCurationSync },
        { provide: DB, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(TrophiesService);
    return { db, chains };
  }

  beforeEach(() => {
    ruleCurationSync = mock<TrophyRuleCurationSyncService>();
  });

  const baseData = {
    name: 'Chaos Cup',
    recipientKind: 'team' as const,
    description: 'The team that wins after four matches.',
    awardRuleKind: 'direct_source' as const,
    awardProcedure: 'Recorded from the season standings.',
    externalIds: [{ externalSystemId: 1, externalId: 'Chaos Cup' }],
  };

  it('creates a new trophy when no external IDs match', async () => {
    // query 0: external-id lookup finds nothing; query 1: the insert
    // returns the row; query 2: the one external ID is new and gets inserted.
    const { db, chains } = await build([], [fakeTrophy]);

    const result = await service.upsert(baseData);

    expect(result).toEqual({ trophy: fakeTrophy, created: true });
    // The trophy row's own three queries; the rule sync is mocked.
    expect(chains).toHaveLength(3);
    expect(db.insert).toHaveBeenCalledWith(trophies);
    expect(db.update).not.toHaveBeenCalled();
  });

  it('updates the matching trophy when exactly one external ID matches', async () => {
    const { db } = await build(
      [{ ownerId: 1, externalSystemId: 1, externalId: 'Chaos Cup' }],
      [fakeTrophy],
    );

    const result = await service.upsert(baseData);

    expect(result).toEqual({ trophy: fakeTrophy, created: false });
    expect(db.update).toHaveBeenCalledWith(trophies);
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('throws TrophyUpsertConflictError when external IDs match two trophies', async () => {
    await build([
      { ownerId: 1, externalSystemId: 1, externalId: 'Chaos Cup' },
      { ownerId: 2, externalSystemId: 2, externalId: 'other' },
    ]);

    await expect(
      service.upsert({
        ...baseData,
        externalIds: [
          { externalSystemId: 1, externalId: 'Chaos Cup' },
          { externalSystemId: 2, externalId: 'other' },
        ],
      }),
    ).rejects.toBeInstanceOf(TrophyUpsertConflictError);
  });

  it('writes the league id on the external-id upsert path', async () => {
    const { chains } = await build([], [{ ...fakeTrophy, leagueId: 7 }]);

    await service.upsert({
      ...baseData,
      competitionGroupId: null,
      leagueId: 7,
    });

    expect(firstCallArg(chains[1].values)).toMatchObject({
      competitionGroupId: null,
      leagueId: 7,
    });
  });

  it('hands the rule curation to the sync service on the upsert transaction', async () => {
    const { db } = await build([], [fakeTrophy]);

    await service.upsert(baseData);

    // mockDb hands its own handle to the transaction callback, so the sync
    // receiving `db` proves it ran inside the one transaction.
    expect(ruleCurationSync.sync).toHaveBeenCalledWith(
      db,
      fakeTrophy.id,
      baseData,
    );
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it('propagates a rule-curation sync failure out of the one transaction', async () => {
    const failure = new Error('rule sync failed');
    ruleCurationSync.sync.mockRejectedValue(failure);
    const { db } = await build([], [fakeTrophy]);

    await expect(service.upsert(baseData)).rejects.toThrow(failure);
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  describe('resolveByName', () => {
    it('answers the id of the one trophy carrying the name', async () => {
      const { chains } = await build([{ id: 31 }]);

      await expect(service.resolveByName('Season MVP')).resolves.toEqual({
        found: true,
        id: 31,
      });
      expect(extractFilterValues(firstCallArg(chains[0].where))).toBe(
        'Season MVP',
      );
      // Confirms the match is a real `eq()`, not merely a value check: a
      // value-only assertion cannot distinguish `eq()` from `ilike()`, so an
      // accidental case-insensitive swap (a prefix search
      // already uses ilike) would silently break the "exact and
      // case-sensitive" guarantee this method's doc comment promises.
      const sql = sqlText(firstCallArg(chains[0].where));
      expect(sql).toContain('=');
      expect(sql.toLowerCase()).not.toContain('ilike');
      expect(sql.toLowerCase()).not.toContain('lower');
    });

    it('reports not found rather than throwing for an unknown name', async () => {
      await build([]);

      await expect(service.resolveByName('Nonesuch')).resolves.toEqual({
        found: false,
      });
    });

    it('reports not found for an ambiguous name rather than picking one', async () => {
      await build([{ id: 31 }, { id: 32 }]);

      await expect(service.resolveByName('Top Scorer')).resolves.toEqual({
        found: false,
      });
    });
  });
});
