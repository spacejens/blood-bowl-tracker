import type { Db } from '@blood-bowl-tracker/db';
import { DB } from '@blood-bowl-tracker/db';
import type { QueryChain } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { ExternalSystemsService } from './external-systems.service';

const fakeSystem = {
  id: 1,
  name: 'BBL',
  category: 'imported_data_source' as const,
  createdAt: new Date('2026-01-01'),
};

describe('ExternalSystemsService', () => {
  let service: ExternalSystemsService;

  async function build(...rowsPerQuery: unknown[][]): Promise<{
    db: Db;
    chains: QueryChain[];
  }> {
    const { db, chains } = mockDb(...rowsPerQuery);
    const moduleRef = await Test.createTestingModule({
      providers: [ExternalSystemsService, { provide: DB, useValue: db }],
    }).compile();
    service = moduleRef.get(ExternalSystemsService);
    return { db, chains };
  }

  it('returns the existing system without inserting when name matches', async () => {
    const { db } = await build([fakeSystem]);
    const result = await service.upsert({
      name: 'BBL',
      category: 'imported_data_source',
    });
    expect(result).toEqual({ system: fakeSystem, created: false });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('creates a new system when no name matches', async () => {
    const { db } = await build([], [fakeSystem]);
    const result = await service.upsert({
      name: 'NAF',
      category: 'referenced_not_imported',
    });
    expect(result).toEqual({ system: fakeSystem, created: true });
    expect(db.insert).toHaveBeenCalled();
  });
});
