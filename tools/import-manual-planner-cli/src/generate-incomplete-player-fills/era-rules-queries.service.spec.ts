import { eraRulesSets, rulesSets } from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { EraRulesQueriesService } from './era-rules-queries.service';
import { renderedWhere, renderSql } from './fill-query.test-helpers';

describe('EraRulesQueriesService', () => {
  let service: EraRulesQueriesService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [EraRulesQueriesService],
    }).compile();
    service = moduleRef.get(EraRulesQueriesService);
  });

  it('reads each rules set of the eras, whether injuries never heal, and its cheapest advancement', async () => {
    const row = {
      eraId: 4,
      rulesSetId: 7,
      lastingInjuriesNeverHeal: false,
      cheapestCost: 6,
    };
    const { db, chains } = mockDb([row]);

    await expect(service.eraRulesSets(db, [4])).resolves.toEqual([row]);

    expect(chains[0].leftJoin).toHaveBeenCalledTimes(1);
    expect(renderedWhere(chains[0]).params).toEqual([4]);
    expect(chains[0].groupBy).toHaveBeenCalledWith(
      eraRulesSets.eraId,
      eraRulesSets.rulesSetId,
      rulesSets.lastingInjuriesNeverHeal,
    );
  });

  it("reads every skill's category under the eras' rules sets", async () => {
    const row = { skillId: 200, rulesSetId: 7, category: 'agility' };
    const { db, chains } = mockDb([row]);

    await expect(service.skillCategories(db, [4, 5])).resolves.toEqual([row]);

    expect(db.selectDistinct).toHaveBeenCalled();
    expect(renderedWhere(chains[0]).params).toEqual([4, 5]);
  });

  it("selects each rules set's own costs and the era league's", async () => {
    const row = {
      eraId: 4,
      rulesSetId: 7,
      leagueId: null,
      advancementNumber: 1,
      advancementKind: 'chosen_primary_skill',
      skillId: null,
      sppCost: 6,
    };
    const { db, chains } = mockDb([row]);

    await expect(service.advancementCosts(db, [4])).resolves.toEqual([row]);

    const costJoin = renderSql(chains[0].innerJoin.mock.calls[1][1]);
    expect(costJoin.sql).toContain('"advancement_costs"."league_id" is null');
    expect(costJoin.sql).toContain('"advancement_costs"."league_id" = "');
    expect(renderedWhere(chains[0]).params).toEqual([4]);
  });

  it('reads no rules sets without querying when given nothing to filter by', async () => {
    const { db, chains } = mockDb();

    await expect(service.eraRulesSets(db, [])).resolves.toEqual([]);

    expect(chains).toHaveLength(0);
  });

  it('reads no skill categories without querying when given nothing to filter by', async () => {
    const { db, chains } = mockDb();

    await expect(service.skillCategories(db, [])).resolves.toEqual([]);

    expect(chains).toHaveLength(0);
  });

  it('reads no advancement costs without querying when given nothing to filter by', async () => {
    const { db, chains } = mockDb();

    await expect(service.advancementCosts(db, [])).resolves.toEqual([]);

    expect(chains).toHaveLength(0);
  });
});
