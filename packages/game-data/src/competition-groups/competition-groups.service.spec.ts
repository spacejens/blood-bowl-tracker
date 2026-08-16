import { competitionGroups, DB } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { mockDb } from '../shared/db-mock.test-helpers';
import {
  CompetitionGroupsService,
  CompetitionGroupUpsertConflictError,
} from './competition-groups.service';

const externalIds = [{ externalSystemId: 2, externalId: 'Chaos Cup' }];

async function makeService(...rowsPerQuery: unknown[][]) {
  const db = mockDb(...rowsPerQuery);
  const moduleRef = await Test.createTestingModule({
    providers: [CompetitionGroupsService, { provide: DB, useValue: db.db }],
  }).compile();
  return { service: moduleRef.get(CompetitionGroupsService), db };
}

describe('CompetitionGroupsService', () => {
  it('inserts a new group when no external id matches', async () => {
    const row = { id: 7, name: 'Chaos Cup', leagueId: 2 };
    // query 0: external-id lookup finds nothing; query 1: the insert returns
    // the row; query 2: the new external id is inserted.
    const { service, db } = await makeService([], [row]);

    const result = await service.upsert({
      name: 'Chaos Cup',
      leagueId: 2,
      externalIds,
    });

    expect(result).toEqual({ competitionGroup: row, created: true });
    expect(db.db.insert).toHaveBeenCalled();
    expect(db.db.update).not.toHaveBeenCalled();
  });

  it('updates the matching group when exactly one external id matches', async () => {
    const updated = { id: 7, name: 'Chaos Cup', leagueId: 3 };
    const { service, db } = await makeService(
      [{ ownerId: 7, externalSystemId: 2, externalId: 'Chaos Cup' }],
      [updated],
    );

    const result = await service.upsert({
      name: 'Chaos Cup',
      leagueId: 3,
      externalIds,
    });

    expect(result).toEqual({ competitionGroup: updated, created: false });
    expect(db.chains[1].set).toHaveBeenCalledWith({
      name: 'Chaos Cup',
      leagueId: 3,
    });
  });

  it('throws a conflict error when external ids match different groups', async () => {
    const { service } = await makeService([
      { ownerId: 1, externalSystemId: 2, externalId: 'Chaos Cup' },
      { ownerId: 2, externalSystemId: 3, externalId: 'Chaos Cup' },
    ]);

    await expect(
      service.upsert({ name: 'Chaos Cup', leagueId: 2, externalIds }),
    ).rejects.toBeInstanceOf(CompetitionGroupUpsertConflictError);
  });

  it('lists every competition group', async () => {
    const rows = [
      {
        id: 1,
        name: 'Major Season',
        leagueId: 1,
        createdAt: new Date('2026-01-01'),
      },
      {
        id: 2,
        name: 'Chaos Cup',
        leagueId: 1,
        createdAt: new Date('2026-01-02'),
      },
    ];
    const { db, chains } = mockDb(rows);
    const moduleRef = await Test.createTestingModule({
      providers: [CompetitionGroupsService, { provide: DB, useValue: db }],
    }).compile();
    const service = moduleRef.get(CompetitionGroupsService);

    await expect(service.listAll()).resolves.toEqual(rows);
    expect(chains[0].from).toHaveBeenCalledWith(competitionGroups);
  });
});
