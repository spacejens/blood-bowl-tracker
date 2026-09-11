import type { Db } from '@blood-bowl-tracker/db';
import { leagues, trophies } from '@blood-bowl-tracker/db';
import {
  closeTestDb,
  resetGameDataTables,
} from '@blood-bowl-tracker/db/test-helpers';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { connectTestDb } from './e2e-database';

/**
 * `trophies_award_rule` is a plain single-table CHECK constraint (see
 * `trophies.ts` in packages/db), so it can only be exercised against real
 * Postgres, not a mocked db — mirrors the pattern in
 * `career-threshold-trophy-rule.e2e-spec.ts`.
 */
describe('trophies_award_rule check constraint (real Postgres)', () => {
  let db: Db;
  let leagueId: number;

  beforeAll(async () => {
    db = await connectTestDb();
  });

  afterAll(async () => {
    await closeTestDb(db);
  });

  beforeEach(async () => {
    await resetGameDataTables(db);
    const [league] = await db
      .insert(leagues)
      .values({ name: 'Constraint League' })
      .returning();
    leagueId = league.id;
  });

  it('rejects a computed max_count rule with a team recipient', async () => {
    await expect(
      db.insert(trophies).values({
        name: 'Invalid Trophy',
        recipientKind: 'team',
        leagueId,
        awardRuleKind: 'max_count',
        awardRuleRole: 'acting',
        awardRuleTieCutoff: 1,
      }),
    ).rejects.toMatchObject({
      cause: { constraint_name: 'trophies_award_rule' },
    });
  });

  it('accepts a computed max_count rule with a player recipient', async () => {
    await expect(
      db.insert(trophies).values({
        name: 'Valid Trophy',
        recipientKind: 'player',
        leagueId,
        awardRuleKind: 'max_count',
        awardRuleRole: 'acting',
        awardRuleTieCutoff: 1,
      }),
    ).resolves.not.toThrow();
  });
});
