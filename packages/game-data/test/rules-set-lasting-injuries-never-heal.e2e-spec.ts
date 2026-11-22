import type { UpsertRulesSet } from '@blood-bowl-tracker/api-contract';
import type { Db } from '@blood-bowl-tracker/db';
import { DB, externalSystems, rulesSets } from '@blood-bowl-tracker/db';
import {
  closeTestDb,
  resetGameDataTables,
} from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { RulesSetsService } from '../src/rules-sets/rules-sets.service';
import { connectTestDb } from './e2e-database';

/**
 * A rules set's lasting_injuries_never_heal flag overlays like its
 * characteristic formats: a new rules set that says nothing may heal, a
 * stated value is stored, and a later upsert that omits it keeps what is
 * stored.
 */
describe('rules set lasting_injuries_never_heal (real Postgres)', () => {
  let db: Db;
  let service: RulesSetsService;
  let systemId: number;

  const crp = (overrides: Partial<UpsertRulesSet> = {}): UpsertRulesSet => ({
    name: 'CRP',
    externalIds: [{ externalSystemId: systemId, externalId: 'CRP' }],
    ...overrides,
  });

  const stored = async (): Promise<boolean[]> =>
    (
      await db
        .select({ flag: rulesSets.lastingInjuriesNeverHeal })
        .from(rulesSets)
    ).map((row) => row.flag);

  beforeAll(async () => {
    db = await connectTestDb();
  });

  afterAll(async () => {
    await closeTestDb(db);
  });

  beforeEach(async () => {
    await resetGameDataTables(db);
    const [system] = await db
      .insert(externalSystems)
      .values({ name: 'Name', category: 'bookkeeping' })
      .returning();
    systemId = system.id;
    const moduleRef = await Test.createTestingModule({
      providers: [RulesSetsService, { provide: DB, useValue: db }],
    }).compile();
    service = moduleRef.get(RulesSetsService);
  });

  it('stores false for a new rules set whose upsert says nothing about healing', async () => {
    await service.upsert(crp());

    expect(await stored()).toEqual([false]);
  });

  it('stores a stated flag and keeps it when a later upsert omits it', async () => {
    await service.upsert(crp({ lastingInjuriesNeverHeal: true }));
    await service.upsert(crp());

    expect(await stored()).toEqual([true]);
  });

  it('clears a flag an upsert states as false', async () => {
    await service.upsert(crp({ lastingInjuriesNeverHeal: true }));
    await service.upsert(crp({ lastingInjuriesNeverHeal: false }));

    expect(await stored()).toEqual([false]);
  });
});
