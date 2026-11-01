import { describe, expect, it } from 'vitest';

import {
  extractAllFilterValues,
  extractJoinColumns,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import {
  BB2020,
  bb2020Costs,
  BB2025,
  bb2025Costs,
  CRP,
  crpCosts,
  ERA,
  FAN_FAVOURITE,
  fanFavouriteCost,
  gainedSkills,
  makeUnspentSppService,
  playerRow,
  POSITION,
  unspentSppDb,
  unspentSppFor,
} from './unspent-spp.test-helpers';

const CRP_ERA = [{ eraId: ERA, rulesSetId: CRP }];
const BB2020_ERA = [{ eraId: ERA, rulesSetId: BB2020 }];
const BB2025_ERA = [{ eraId: ERA, rulesSetId: BB2025 }];

function filterValues(where: unknown): unknown[] {
  return extractAllFilterValues(firstCallArg(where));
}

describe('UnspentSppService loading', () => {
  it('issues no query for an empty id list', async () => {
    const db = unspentSppDb({ players: [] });
    const service = await makeUnspentSppService(db);

    expect(await service.forPlayers([])).toEqual(new Map());
    expect(db.chains).toHaveLength(0);
  });

  it('stops after the player query when no requested player exists', async () => {
    const db = unspentSppDb({ players: [] });
    const service = await makeUnspentSppService(db);

    expect(await service.forPlayers([5])).toEqual(new Map());
    expect(db.chains).toHaveLength(1);
  });

  it('returns undefined from forPlayer for an unknown player', async () => {
    const service = await makeUnspentSppService(unspentSppDb({ players: [] }));

    expect(await service.forPlayer(5)).toBeUndefined();
  });

  it('asks for each requested id once', async () => {
    const db = unspentSppDb({ players: [] });
    const service = await makeUnspentSppService(db);

    await service.forPlayers([1, 1]);

    expect(filterValues(db.chains[0].where)).toEqual([1]);
  });

  it('loads a whole batch in one query per table, filtered by the batch', async () => {
    const db = unspentSppDb({
      players: [
        playerRow({ playerId: 1 }),
        playerRow({ playerId: 2, eraId: 21, leagueId: 31, positionId: 11 }),
      ],
      eraRulesSets: CRP_ERA,
      playerSkills: gainedSkills(1),
      costs: crpCosts(),
    });
    const service = await makeUnspentSppService(db);

    const results = await service.forPlayers([1, 2]);

    expect([...results.keys()]).toEqual([1, 2]);
    expect(db.chains).toHaveLength(6);
    expect(filterValues(db.chains[0].where)).toEqual([1, 2]);
    expect(filterValues(db.chains[1].where)).toEqual([ERA, 21]);
    expect(filterValues(db.chains[2].where)).toEqual([1, 2]);
    expect(extractJoinColumns(firstCallArg(db.chains[2].where))).toEqual([
      'player_advancements.player_id',
    ]);
    expect(filterValues(db.chains[3].where)).toEqual(
      expect.arrayContaining([101, CRP]),
    );
    expect(filterValues(db.chains[4].where)).toEqual(
      expect.arrayContaining([POSITION, 11, CRP, false]),
    );
    expect(filterValues(db.chains[5].where)).toEqual(
      expect.arrayContaining([CRP, 30, 31]),
    );
  });

  it('skips the rules set queries when no era lists a rules set', async () => {
    const db = unspentSppDb({
      players: [playerRow({ sppTotal: 10 })],
      playerSkills: gainedSkills(1),
    });
    const service = await makeUnspentSppService(db);

    expect(await service.forPlayer(1)).toEqual({
      status: 'unknown',
      reason: 'no_rules_set',
    });
    expect(db.chains).toHaveLength(3);
  });

  it('works each player out on their own', async () => {
    const db = unspentSppDb({
      players: [
        playerRow({ playerId: 1, sppTotal: 6 }),
        playerRow({ playerId: 2, sppTotal: null }),
      ],
      eraRulesSets: CRP_ERA,
      playerSkills: gainedSkills(1),
      costs: crpCosts(),
    });
    const service = await makeUnspentSppService(db);

    const results = await service.forPlayers([1, 2]);

    expect(results.get(1)).toMatchObject({ status: 'known', unspentMin: 0 });
    expect(results.get(2)).toEqual({
      status: 'unknown',
      reason: 'no_total_spp',
    });
  });
});

describe('UnspentSppService unknown reasons', () => {
  it('does not work out a star player, whatever else is recorded', async () => {
    const result = await unspentSppFor({
      players: [playerRow({ isStarPlayer: true, sppTotal: null })],
    });

    expect(result).toEqual({ status: 'unknown', reason: 'star_player' });
  });

  it('needs a total SPP', async () => {
    const result = await unspentSppFor({
      players: [playerRow({ sppTotal: null })],
      eraRulesSets: CRP_ERA,
      costs: crpCosts(),
    });

    expect(result).toEqual({ status: 'unknown', reason: 'no_total_spp' });
  });

  it('reports a missing total SPP before a missing rules set', async () => {
    const result = await unspentSppFor({
      players: [playerRow({ sppTotal: null })],
    });

    expect(result).toEqual({ status: 'unknown', reason: 'no_total_spp' });
  });

  it('needs a rules set for the era', async () => {
    const result = await unspentSppFor({
      players: [playerRow({ sppTotal: 10 })],
      costs: crpCosts(),
    });

    expect(result).toEqual({ status: 'unknown', reason: 'no_rules_set' });
  });

  it('needs advancement costs for the rules set', async () => {
    const result = await unspentSppFor({
      players: [playerRow({ sppTotal: 10 })],
      eraRulesSets: CRP_ERA,
    });

    expect(result).toEqual({ status: 'unknown', reason: 'no_costs' });
  });

  it("does not count another league's rows as costs", async () => {
    const result = await unspentSppFor({
      players: [playerRow({ sppTotal: 10 })],
      eraRulesSets: CRP_ERA,
      costs: [fanFavouriteCost(31)],
    });

    expect(result).toEqual({ status: 'unknown', reason: 'no_costs' });
  });

  it('reports a history no cost table fits', async () => {
    const result = await unspentSppFor({
      players: [playerRow({ sppTotal: 400 })],
      eraRulesSets: CRP_ERA,
      playerSkills: gainedSkills(7),
      costs: crpCosts(),
    });

    expect(result).toEqual({
      status: 'unknown',
      reason: 'inconsistent_history',
    });
  });
});

describe('UnspentSppService under fixed thresholds', () => {
  it('is exact', async () => {
    const result = await unspentSppFor({
      players: [playerRow({ sppTotal: 40 })],
      eraRulesSets: CRP_ERA,
      playerSkills: gainedSkills(3),
      costs: crpCosts(),
    });

    expect(result).toEqual({
      status: 'known',
      totalSpp: 40,
      advancementsGained: 3,
      spentMin: 31,
      spentMax: 31,
      unspentMin: 9,
      unspentMax: 9,
      cheapestNextCost: 20,
      coversAnother: 'no',
      storedVerdict: 'none_stored',
      storedUnspentSpp: null,
    });
  });

  it('counts characteristic increases as advancements', async () => {
    const result = await unspentSppFor({
      players: [
        playerRow({
          sppTotal: 31,
          moveIncreaseCount: 1,
          agilityIncreaseCount: 1,
        }),
      ],
      eraRulesSets: CRP_ERA,
      playerSkills: gainedSkills(1),
      costs: crpCosts(),
    });

    expect(result).toMatchObject({
      advancementsGained: 3,
      spentMin: 31,
      spentMax: 31,
      unspentMin: 0,
    });
  });

  it('has no next cost once the table runs out', async () => {
    const result = await unspentSppFor({
      players: [playerRow({ sppTotal: 200 })],
      eraRulesSets: CRP_ERA,
      playerSkills: gainedSkills(6),
      costs: crpCosts(),
    });

    expect(result).toMatchObject({
      spentMin: 176,
      unspentMin: 24,
      cheapestNextCost: null,
      coversAnother: 'no',
      storedVerdict: 'none_stored',
      storedUnspentSpp: null,
    });
  });

  it('returns a negative unspent figure as is', async () => {
    const result = await unspentSppFor({
      players: [playerRow({ sppTotal: 3 })],
      eraRulesSets: CRP_ERA,
      playerSkills: gainedSkills(1),
      costs: crpCosts(),
    });

    expect(result).toMatchObject({
      unspentMin: -3,
      unspentMax: -3,
      coversAnother: 'no',
      storedVerdict: 'none_stored',
      storedUnspentSpp: null,
    });
  });

  it('skips starting skills and free extra skills', async () => {
    const result = await unspentSppFor({
      players: [playerRow({ sppTotal: 6 })],
      eraRulesSets: CRP_ERA,
      playerSkills: [
        { playerId: 1, skillId: 900, source: 'starting', isFreeExtra: false },
        ...gainedSkills(1),
        { playerId: 1, skillId: 102, source: 'advancement', isFreeExtra: true },
      ],
      costs: crpCosts(),
    });

    expect(result).toMatchObject({
      advancementsGained: 1,
      spentMin: 6,
      spentMax: 6,
      unspentMin: 0,
      cheapestNextCost: 10,
      coversAnother: 'no',
      storedVerdict: 'none_stored',
      storedUnspentSpp: null,
    });
  });
});

describe('UnspentSppService under type-priced rules sets', () => {
  it('gives a range when the roll and category are unknown', async () => {
    const result = await unspentSppFor({
      players: [playerRow({ sppTotal: 30 })],
      eraRulesSets: BB2020_ERA,
      playerSkills: gainedSkills(2),
      costs: bb2020Costs(),
    });

    expect(result).toEqual({
      status: 'known',
      totalSpp: 30,
      advancementsGained: 2,
      spentMin: 7,
      spentMax: 26,
      unspentMin: 4,
      unspentMax: 23,
      cheapestNextCost: 6,
      coversAnother: 'maybe',
      storedVerdict: 'none_stored',
      storedUnspentSpp: null,
    });
  });

  it("uses the position's primary access to a chosen skill's category", async () => {
    const result = await unspentSppFor({
      players: [playerRow({ sppTotal: 10 })],
      eraRulesSets: BB2020_ERA,
      playerSkills: gainedSkills(1, 'chosen'),
      skillCategories: [
        { skillId: 101, rulesSetId: BB2020, category: 'general' },
      ],
      positionAccess: [
        {
          positionId: POSITION,
          rulesSetId: BB2020,
          category: 'general',
          access: 'primary',
        },
      ],
      costs: bb2020Costs(),
    });

    expect(result).toMatchObject({
      spentMin: 6,
      spentMax: 6,
      unspentMin: 4,
      cheapestNextCost: 4,
      coversAnother: 'yes',
      storedVerdict: 'none_stored',
      storedUnspentSpp: null,
    });
  });

  it('prices characteristic increases as random characteristics', async () => {
    const result = await unspentSppFor({
      players: [
        playerRow({
          sppTotal: 40,
          strengthIncreaseCount: 1,
          armourIncreaseCount: 1,
        }),
      ],
      eraRulesSets: BB2020_ERA,
      costs: bb2020Costs(),
    });

    expect(result).toMatchObject({
      advancementsGained: 2,
      spentMin: 38,
      spentMax: 38,
      unspentMin: 2,
      cheapestNextCost: 6,
      coversAnother: 'no',
      storedVerdict: 'none_stored',
      storedUnspentSpp: null,
    });
  });

  it('finds no fit for a random secondary skill under BB2025', async () => {
    const result = await unspentSppFor({
      players: [playerRow({ sppTotal: 20 })],
      eraRulesSets: BB2025_ERA,
      playerSkills: gainedSkills(1, 'random'),
      skillCategories: [
        { skillId: 101, rulesSetId: BB2025, category: 'agility' },
      ],
      positionAccess: [
        {
          positionId: POSITION,
          rulesSetId: BB2025,
          category: 'agility',
          access: 'secondary',
        },
      ],
      costs: bb2025Costs(),
    });

    expect(result).toEqual({
      status: 'unknown',
      reason: 'inconsistent_history',
    });
  });

  it('reads an unknown-roll secondary skill as chosen under BB2025', async () => {
    const result = await unspentSppFor({
      players: [playerRow({ sppTotal: 20 })],
      eraRulesSets: BB2025_ERA,
      playerSkills: gainedSkills(1),
      skillCategories: [
        { skillId: 101, rulesSetId: BB2025, category: 'agility' },
      ],
      positionAccess: [
        {
          positionId: POSITION,
          rulesSetId: BB2025,
          category: 'agility',
          access: 'secondary',
        },
      ],
      costs: bb2025Costs(),
    });

    expect(result).toMatchObject({
      spentMin: 10,
      spentMax: 10,
      unspentMin: 10,
    });
  });
});

describe("UnspentSppService with a league's granted skill", () => {
  it('counts Fan Favourite as advancement 7 for a tLoEG player', async () => {
    const result = await unspentSppFor({
      players: [playerRow({ sppTotal: 320 })],
      eraRulesSets: CRP_ERA,
      playerSkills: [
        ...gainedSkills(6),
        {
          playerId: 1,
          skillId: FAN_FAVOURITE,
          source: 'advancement',
          isFreeExtra: false,
        },
      ],
      costs: [...crpCosts(), fanFavouriteCost()],
    });

    expect(result).toMatchObject({
      advancementsGained: 7,
      spentMin: 301,
      spentMax: 301,
      unspentMin: 19,
      cheapestNextCost: null,
      coversAnother: 'no',
      storedVerdict: 'none_stored',
      storedUnspentSpp: null,
    });
  });

  it('offers Fan Favourite as the next advancement after the sixth', async () => {
    const result = await unspentSppFor({
      players: [playerRow({ sppTotal: 301 })],
      eraRulesSets: CRP_ERA,
      playerSkills: gainedSkills(6),
      costs: [...crpCosts(), fanFavouriteCost()],
    });

    expect(result).toMatchObject({
      unspentMin: 125,
      cheapestNextCost: 125,
      coversAnother: 'yes',
      storedVerdict: 'none_stored',
      storedUnspentSpp: null,
    });
  });

  it("does not apply another league's granted skill", async () => {
    const result = await unspentSppFor({
      players: [playerRow({ sppTotal: 320, leagueId: 31 })],
      eraRulesSets: CRP_ERA,
      playerSkills: [
        ...gainedSkills(6),
        {
          playerId: 1,
          skillId: FAN_FAVOURITE,
          source: 'advancement',
          isFreeExtra: false,
        },
      ],
      costs: [...crpCosts(), fanFavouriteCost()],
    });

    expect(result).toEqual({
      status: 'unknown',
      reason: 'inconsistent_history',
    });
  });
});

describe('UnspentSppService with several rules sets in the era', () => {
  it('keeps the widest range and the cheapest next cost', async () => {
    // CRP: 6 spent, next 10. BB2020: 18 spent, next 4.
    const result = await unspentSppFor({
      players: [playerRow({ sppTotal: 20, moveIncreaseCount: 1 })],
      eraRulesSets: [...CRP_ERA, ...BB2020_ERA],
      costs: [...crpCosts(), ...bb2020Costs()],
    });

    expect(result).toEqual({
      status: 'known',
      totalSpp: 20,
      advancementsGained: 1,
      spentMin: 6,
      spentMax: 18,
      unspentMin: 2,
      unspentMax: 14,
      cheapestNextCost: 4,
      coversAnother: 'maybe',
      storedVerdict: 'none_stored',
      storedUnspentSpp: null,
    });
  });

  it('ignores a rules set the history does not fit', async () => {
    const result = await unspentSppFor({
      players: [playerRow({ sppTotal: 6 })],
      eraRulesSets: [...CRP_ERA, ...BB2025_ERA],
      playerSkills: gainedSkills(1, 'random'),
      skillCategories: [
        { skillId: 101, rulesSetId: BB2025, category: 'agility' },
      ],
      positionAccess: [
        {
          positionId: POSITION,
          rulesSetId: BB2025,
          category: 'agility',
          access: 'secondary',
        },
      ],
      costs: [...crpCosts(), ...bb2025Costs()],
    });

    expect(result).toMatchObject({
      spentMin: 6,
      spentMax: 6,
      cheapestNextCost: 10,
    });
  });

  it('reports an inconsistent history when the other rules sets have no costs', async () => {
    const result = await unspentSppFor({
      players: [playerRow({ sppTotal: 400 })],
      eraRulesSets: [...CRP_ERA, ...BB2020_ERA],
      playerSkills: gainedSkills(7),
      costs: crpCosts(),
    });

    expect(result).toEqual({
      status: 'unknown',
      reason: 'inconsistent_history',
    });
  });

  it('says maybe when the rules sets disagree on the verdict', async () => {
    // CRP: spent 76, unspent 24, next 100: no.
    // BB2020: spent 31, unspent 69, next 15: yes.
    const result = await unspentSppFor({
      players: [playerRow({ sppTotal: 100 })],
      eraRulesSets: [...CRP_ERA, ...BB2020_ERA],
      playerSkills: gainedSkills(5, 'random'),
      skillCategories: [101, 102, 103, 104, 105].map((skillId) => ({
        skillId,
        rulesSetId: BB2020,
        category: 'general' as const,
      })),
      positionAccess: [
        {
          positionId: POSITION,
          rulesSetId: BB2020,
          category: 'general',
          access: 'primary',
        },
      ],
      costs: [...crpCosts(), ...bb2020Costs()],
    });

    expect(result).toEqual({
      status: 'known',
      totalSpp: 100,
      advancementsGained: 5,
      spentMin: 31,
      spentMax: 76,
      unspentMin: 24,
      unspentMax: 69,
      cheapestNextCost: 15,
      coversAnother: 'maybe',
      storedVerdict: 'none_stored',
      storedUnspentSpp: null,
    });
  });

  it('says no when every rules set says no', async () => {
    // CRP: spent 31, unspent 19, next 20: no.
    // BB2020: spent 44, unspent 6, next 8: no.
    const result = await unspentSppFor({
      players: [playerRow({ sppTotal: 50 })],
      eraRulesSets: [...CRP_ERA, ...BB2020_ERA],
      playerSkills: gainedSkills(3, 'chosen'),
      skillCategories: [101, 102, 103].map((skillId) => ({
        skillId,
        rulesSetId: BB2020,
        category: 'agility' as const,
      })),
      positionAccess: [
        {
          positionId: POSITION,
          rulesSetId: BB2020,
          category: 'agility',
          access: 'secondary',
        },
      ],
      costs: [...crpCosts(), ...bb2020Costs()],
    });

    expect(result).toEqual({
      status: 'known',
      totalSpp: 50,
      advancementsGained: 3,
      spentMin: 31,
      spentMax: 44,
      unspentMin: 6,
      unspentMax: 19,
      cheapestNextCost: 8,
      coversAnother: 'no',
      storedVerdict: 'none_stored',
      storedUnspentSpp: null,
    });
  });

  it('ignores a rules set with no costs', async () => {
    const result = await unspentSppFor({
      players: [playerRow({ sppTotal: 6 })],
      eraRulesSets: [...CRP_ERA, ...BB2020_ERA],
      playerSkills: gainedSkills(1),
      costs: crpCosts(),
    });

    expect(result).toMatchObject({ spentMin: 6, spentMax: 6 });
  });
});

describe('UnspentSppService verdict boundaries', () => {
  it('says yes when the smallest unspent figure equals the next cost', async () => {
    const result = await unspentSppFor({
      players: [playerRow({ sppTotal: 16 })],
      eraRulesSets: CRP_ERA,
      playerSkills: gainedSkills(1),
      costs: crpCosts(),
    });

    expect(result).toMatchObject({
      unspentMin: 10,
      cheapestNextCost: 10,
      coversAnother: 'yes',
      storedVerdict: 'none_stored',
      storedUnspentSpp: null,
    });
  });

  it('says no when the largest unspent figure is one short', async () => {
    const result = await unspentSppFor({
      players: [playerRow({ sppTotal: 15 })],
      eraRulesSets: CRP_ERA,
      playerSkills: gainedSkills(1),
      costs: crpCosts(),
    });

    expect(result).toMatchObject({
      unspentMax: 9,
      cheapestNextCost: 10,
      coversAnother: 'no',
      storedVerdict: 'none_stored',
      storedUnspentSpp: null,
    });
  });

  it('says maybe when only the largest unspent figure reaches the next cost', async () => {
    // Spent 7..26, so unspent -13..6 against a next cost of 6.
    const result = await unspentSppFor({
      players: [playerRow({ sppTotal: 13 })],
      eraRulesSets: BB2020_ERA,
      playerSkills: gainedSkills(2),
      costs: bb2020Costs(),
    });

    expect(result).toMatchObject({
      unspentMin: -13,
      unspentMax: 6,
      cheapestNextCost: 6,
      coversAnother: 'maybe',
      storedVerdict: 'none_stored',
      storedUnspentSpp: null,
    });
  });
});
