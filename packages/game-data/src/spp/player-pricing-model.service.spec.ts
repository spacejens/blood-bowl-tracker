import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import type { AdvancementKind } from '@blood-bowl-tracker/domain-enums';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import {
  extractAllFilterValues,
  extractFilterValues,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { AdvancementPricingModelService } from './advancement-pricing-model.service';
import { PlayerPricingModelService } from './player-pricing-model.service';

const PLAYER = 7;
const CRP = 1;
const BB2020 = 2;
const BB2025 = 3;

/** One of a rules set's own cost rows, as the costs query selects it. */
function cost(rulesSetId: number, advancementKind: AdvancementKind) {
  return { rulesSetId, leagueId: null, advancementKind };
}

/**
 * AdvancementPricingModelService is pure and dependency-free, so it is passed
 * real (CLAUDE.md's carve-out for a pure decision service among mocked
 * collaborators); only the database is mocked.
 */
async function makeService(
  db: MockDbResult,
): Promise<PlayerPricingModelService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      PlayerPricingModelService,
      AdvancementPricingModelService,
      { provide: DB, useValue: db.db },
    ],
  }).compile();
  return moduleRef.get(PlayerPricingModelService);
}

describe('PlayerPricingModelService', () => {
  it('reports kind_priced for an era whose rules set prices by kind', async () => {
    const db = mockDb(
      [{ rulesSetId: BB2020 }],
      [
        cost(BB2020, 'random_primary_skill'),
        cost(BB2020, 'chosen_primary_skill'),
      ],
    );
    const service = await makeService(db);

    await expect(service.pricingModelForPlayer(PLAYER)).resolves.toBe(
      'kind_priced',
    );
  });

  it('reports fixed_threshold for an era whose rules set uses table rolls', async () => {
    const db = mockDb([{ rulesSetId: CRP }], [cost(CRP, 'table_roll')]);
    const service = await makeService(db);

    await expect(service.pricingModelForPlayer(PLAYER)).resolves.toBe(
      'fixed_threshold',
    );
  });

  it('reports no model when the era rules sets disagree', async () => {
    const db = mockDb(
      [{ rulesSetId: CRP }, { rulesSetId: BB2020 }],
      [cost(CRP, 'table_roll'), cost(BB2020, 'chosen_primary_skill')],
    );
    const service = await makeService(db);

    await expect(service.pricingModelForPlayer(PLAYER)).resolves.toBeNull();
  });

  it('lets a rules set with no cost rows of its own abstain', async () => {
    const db = mockDb(
      [{ rulesSetId: BB2020 }, { rulesSetId: BB2025 }],
      [cost(BB2020, 'chosen_primary_skill')],
    );
    const service = await makeService(db);

    await expect(service.pricingModelForPlayer(PLAYER)).resolves.toBe(
      'kind_priced',
    );
  });

  it('reports no model when no rules set of the era has costs', async () => {
    const db = mockDb([{ rulesSetId: BB2020 }], []);
    const service = await makeService(db);

    await expect(service.pricingModelForPlayer(PLAYER)).resolves.toBeNull();
  });

  it('reports no model, without a costs query, for an unknown player', async () => {
    const db = mockDb([]);
    const service = await makeService(db);

    await expect(service.pricingModelForPlayer(PLAYER)).resolves.toBeNull();
    expect(db.chains).toHaveLength(1);
  });

  it("filters by the player, then by the era's rules sets' own rows", async () => {
    const db = mockDb(
      [{ rulesSetId: CRP }, { rulesSetId: BB2020 }],
      [cost(CRP, 'table_roll')],
    );
    const service = await makeService(db);

    await service.pricingModelForPlayer(PLAYER);

    expect(db.chains).toHaveLength(2);
    expect(extractFilterValues(firstCallArg(db.chains[0].where))).toBe(PLAYER);
    // isNull(leagueId) carries no parameter, so only the rules set ids show.
    expect(extractAllFilterValues(firstCallArg(db.chains[1].where))).toEqual([
      CRP,
      BB2020,
    ]);
  });
});
