import { describe, expect, it } from 'vitest';

import {
  BB2020,
  bb2020Costs,
  BB2025,
  CRP,
  crpCosts,
  ERA,
  fanFavouriteCost,
  gainedSkills,
  LEAGUE,
  makeUnspentSppService,
  playerRow,
  POSITION,
  unspentSppDb,
} from './unspent-spp.test-helpers';

describe('UnspentSppService.advancementInputsForPlayers', () => {
  it('issues no query for an empty id list', async () => {
    const db = unspentSppDb({ players: [] });
    const service = await makeUnspentSppService(db);

    expect(await service.advancementInputsForPlayers([])).toEqual(new Map());
    expect(db.chains).toHaveLength(0);
  });

  it('stops after the player query when no requested player exists', async () => {
    const db = unspentSppDb({ players: [] });
    const service = await makeUnspentSppService(db);

    expect(await service.advancementInputsForPlayers([5])).toEqual(new Map());
    expect(db.chains).toHaveLength(1);
  });

  it('gives each rules set of the era its costs, pricing model and the candidates input', async () => {
    const service = await makeUnspentSppService(
      unspentSppDb({
        players: [playerRow({ strengthIncreaseCount: 1 })],
        eraRulesSets: [
          { eraId: ERA, rulesSetId: CRP },
          { eraId: ERA, rulesSetId: BB2020 },
        ],
        playerSkills: gainedSkills(1),
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
        // Another league's house rule never applies to this player.
        costs: [...crpCosts(), fanFavouriteCost(LEAGUE + 1), ...bb2020Costs()],
      }),
    );

    const inputs = await service.advancementInputsForPlayers([1]);

    const skills = [
      { skillId: 101, source: 'advancement', isFreeExtra: false },
    ];
    expect(inputs).toEqual(
      new Map([
        [
          1,
          [
            {
              rulesSetId: CRP,
              pricingModel: 'fixed_threshold',
              costs: crpCosts(),
              candidatesInput: {
                skills,
                characteristicIncreases: 1,
                skillCategories: new Map(),
                positionAccess: new Map(),
                costs: crpCosts(),
              },
            },
            {
              rulesSetId: BB2020,
              pricingModel: 'kind_priced',
              costs: bb2020Costs(),
              candidatesInput: {
                skills,
                characteristicIncreases: 1,
                skillCategories: new Map([[101, 'general']]),
                positionAccess: new Map([['general', 'primary']]),
                costs: bb2020Costs(),
              },
            },
          ],
        ],
      ]),
    );
  });

  it('leaves out a rules set with no cost rows for the player', async () => {
    const service = await makeUnspentSppService(
      unspentSppDb({
        players: [playerRow()],
        eraRulesSets: [
          { eraId: ERA, rulesSetId: CRP },
          { eraId: ERA, rulesSetId: BB2025 },
        ],
        costs: crpCosts(),
      }),
    );

    const inputs = await service.advancementInputsForPlayers([1]);

    expect(inputs.get(1)?.map((input) => input.rulesSetId)).toEqual([CRP]);
  });

  it('gives a player whose era lists no rules set an empty list', async () => {
    const service = await makeUnspentSppService(
      unspentSppDb({ players: [playerRow()] }),
    );

    expect(await service.advancementInputsForPlayers([1])).toEqual(
      new Map([[1, []]]),
    );
  });

  it('leaves out a star player, whose skills are never advancements', async () => {
    const service = await makeUnspentSppService(
      unspentSppDb({
        players: [playerRow({ isStarPlayer: true })],
        eraRulesSets: [{ eraId: ERA, rulesSetId: CRP }],
        costs: crpCosts(),
      }),
    );

    expect(await service.advancementInputsForPlayers([1])).toEqual(new Map());
  });
});
