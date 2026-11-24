import {
  positionRulesSetSkills,
  skillExternalIds,
} from '@blood-bowl-tracker/db';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { renderedWhere, renderSql } from './fill-query.test-helpers';
import { FillQueryScopeService } from './fill-query-scope.service';
import { FillRowShapesService } from './fill-row-shapes.service';
import { PositionRulesQueriesService } from './position-rules-queries.service';

const PAIRS = [{ positionId: 30, eraId: 4 }];
const PAIR_FILTER = /"position_id", .*"era_id"\) in \(\(\$\d+, \$\d+\)\)/;

describe('PositionRulesQueriesService', () => {
  let service: PositionRulesQueriesService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      // Both collaborators are pure and dependency-free: passed real.
      providers: [
        PositionRulesQueriesService,
        FillQueryScopeService,
        FillRowShapesService,
      ],
    }).compile();
    service = moduleRef.get(PositionRulesQueriesService);
  });

  it("reads each candidate position's line and formats under every rules set of his era", async () => {
    const { db, chains } = mockDb([
      {
        positionRulesSetId: 40,
        positionId: 30,
        eraId: 4,
        rulesSetId: 7,
        move: 6,
        strength: 3,
        agility: 3,
        passing: 4,
        armour: 9,
        moveFormat: 'bare',
        strengthFormat: 'bare',
        agilityFormat: 'plus',
        passingFormat: 'plus_zero_legal',
        armourFormat: 'plus',
      },
    ]);

    await expect(service.positionRulesSets(db, PAIRS)).resolves.toEqual([
      {
        positionRulesSetId: 40,
        positionId: 30,
        eraId: 4,
        rulesSetId: 7,
        line: { ma: 6, st: 3, ag: 3, pa: 4, av: 9 },
        formats: {
          ma: 'bare',
          st: 'bare',
          ag: 'plus',
          pa: 'plus_zero_legal',
          av: 'plus',
        },
      },
    ]);

    const where = renderedWhere(chains[0]);
    expect(where.sql).toMatch(PAIR_FILTER);
    expect(where.params).toEqual([30, 4]);
  });

  it('names each starting skill by its Name-system id, if it has one', async () => {
    const row = {
      positionRulesSetId: 40,
      skillId: 100,
      nameId: 'Block',
      attributeValue: null,
    };
    const { db, chains } = mockDb([row]);

    await expect(service.positionSkills(db, PAIRS)).resolves.toEqual([row]);

    const join = renderSql(chains[0].leftJoin.mock.calls[0][1]);
    expect(join.sql).toContain(
      '"skills_external_ids"."external_system_id" = (select',
    );
    expect(join.params).toEqual(['Name']);
    expect(renderedWhere(chains[0]).sql).toMatch(PAIR_FILTER);
    expect(chains[0].orderBy).toHaveBeenCalledWith(
      positionRulesSetSkills.id,
      skillExternalIds.externalId,
    );
  });

  it("reads the team players' positions' category access, skipping removed rows", async () => {
    const row = {
      positionId: 30,
      rulesSetId: 7,
      category: 'agility',
      access: 'primary',
    };
    const { db, chains } = mockDb([row]);

    await expect(service.positionAccess(db, PAIRS)).resolves.toEqual([row]);

    const where = renderedWhere(chains[0]);
    expect(where.sql).toContain(
      '"position_rules_set_skill_categories"."removed" = $1',
    );
    expect(where.params).toEqual([false, 30, 4]);
  });

  it('finds the candidate positions with the Big Guy keyword in their era', async () => {
    const { db, chains } = mockDb([{ positionId: 30, eraId: 4 }]);

    await expect(service.bigGuyPositions(db, PAIRS)).resolves.toEqual([
      { positionId: 30, eraId: 4 },
    ]);

    expect(renderedWhere(chains[0]).params).toEqual(['Big Guy', 30, 4]);
  });

  it('matches nothing when there are no candidate positions', async () => {
    const { db, chains } = mockDb([]);

    await expect(service.positionRulesSets(db, [])).resolves.toEqual([]);

    expect(renderedWhere(chains[0]).sql).toBe('false');
  });
});
