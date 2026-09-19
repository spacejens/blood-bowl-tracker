import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb, PgDialect, SQL } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { StarPlayerPositionsQueryService } from './star-player-positions-query.service';

async function makeService(
  dbResult: MockDbResult,
): Promise<StarPlayerPositionsQueryService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      StarPlayerPositionsQueryService,
      { provide: DB, useValue: dbResult.db },
    ],
  }).compile();
  return moduleRef.get(StarPlayerPositionsQueryService);
}

describe('StarPlayerPositionsQueryService', () => {
  it('returns the rules sets the star is hireable under', async () => {
    const rows = [
      {
        rulesSetId: 2,
        rulesSetName: 'BB2020',
        moveFormat: 'bare',
        strengthFormat: 'bare',
        agilityFormat: 'plus',
        passingFormat: 'plus_zero_legal',
        armourFormat: 'plus',
      },
    ];
    const service = await makeService(mockDb(rows));

    expect(await service.rulesSetsFor(5)).toEqual(rows);
  });

  it('binds the position id into the rules-set query', async () => {
    const dbResult = mockDb([]);
    const service = await makeService(dbResult);

    await service.rulesSetsFor(5);

    const condition = dbResult.chains[0].where.mock.calls[0][0] as SQL;
    expect(new PgDialect().sqlToQuery(condition).params).toEqual([5]);
  });

  it("returns the star's stored characteristics rows", async () => {
    const rows = [
      {
        rulesSetId: 2,
        move: 8,
        strength: 3,
        agility: 2,
        passing: 5,
        armour: 8,
      },
    ];
    const service = await makeService(mockDb(rows));

    expect(await service.characteristicsFor(5)).toEqual(rows);
  });

  it('binds the position id into the characteristics query', async () => {
    const dbResult = mockDb([]);
    const service = await makeService(dbResult);

    await service.characteristicsFor(5);

    const condition = dbResult.chains[0].where.mock.calls[0][0] as SQL;
    expect(new PgDialect().sqlToQuery(condition).params).toEqual([5]);
  });

  it('returns the races and eras the star is hireable in', async () => {
    const rows = [
      {
        raceId: 4,
        raceName: 'Wood Elf',
        eraId: 1,
        eraName: 'BB2020 era',
        startDate: '2020-11-28',
        endDate: null,
      },
    ];
    const service = await makeService(mockDb(rows));

    expect(await service.hireEligibilityFor(5)).toEqual(rows);
  });

  it('binds the position id into the hire-eligibility query', async () => {
    const dbResult = mockDb([]);
    const service = await makeService(dbResult);

    await service.hireEligibilityFor(5);

    const condition = dbResult.chains[0].where.mock.calls[0][0] as SQL;
    const { sql: rendered, params } = new PgDialect().sqlToQuery(condition);
    expect(rendered.toLowerCase()).toContain('position_id');
    expect(params).toEqual([5]);
  });

  it('returns the stored starting skills with their per-rules-set category', async () => {
    const dbResult = mockDb([
      {
        rulesSetId: 100,
        skillName: 'Block',
        attributeValue: null,
        category: 'general',
      },
    ]);
    const service = await makeService(dbResult);

    expect(await service.skillsFor(42)).toEqual([
      {
        rulesSetId: 100,
        skillName: 'Block',
        attributeValue: null,
        category: 'general',
      },
    ]);
    expect(dbResult.chains[0].leftJoin).toHaveBeenCalled();
    expect(dbResult.chains[0].where).toHaveBeenCalled();
  });
});
