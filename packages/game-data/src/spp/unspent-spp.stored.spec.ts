import { describe, expect, it } from 'vitest';

import {
  BB2020,
  bb2020Costs,
  CRP,
  crpCosts,
  ERA,
  gainedSkills,
  modelledUnspentSppFor,
  playerRow,
  unspentSppFor,
} from './unspent-spp.test-helpers';

const CRP_ERA = [{ eraId: ERA, rulesSetId: CRP }];
const BB2020_ERA = [{ eraId: ERA, rulesSetId: BB2020 }];

/** BB2020, total 30, two gained skills: unspent 4 to 23, next cost 6. */
function typePriced(unspentSpp: number | null) {
  return {
    players: [playerRow({ sppTotal: 30, unspentSpp })],
    eraRulesSets: BB2020_ERA,
    playerSkills: gainedSkills(2),
    costs: bb2020Costs(),
  };
}

describe('UnspentSppService with a stored unspent figure', () => {
  it('settles the range to a stored figure inside it', async () => {
    expect(await unspentSppFor(typePriced(10))).toEqual({
      status: 'known',
      totalSpp: 30,
      advancementsGained: 2,
      spentMin: 20,
      spentMax: 20,
      unspentMin: 10,
      unspentMax: 10,
      cheapestNextCost: 6,
      coversAnother: 'yes',
      storedVerdict: 'settled',
      storedUnspentSpp: 10,
    });
  });

  it('keeps the range and flags a stored figure outside it', async () => {
    expect(await unspentSppFor(typePriced(2))).toEqual({
      status: 'known',
      totalSpp: 30,
      advancementsGained: 2,
      spentMin: 7,
      spentMax: 26,
      unspentMin: 4,
      unspentMax: 23,
      cheapestNextCost: 6,
      coversAnother: 'maybe',
      storedVerdict: 'outside_range',
      storedUnspentSpp: 2,
    });
  });

  it('settles per rules set when the era lists several', async () => {
    // CRP: 6 spent, next 10. BB2020: 18 spent, next 4. Stored 5: CRP says
    // no, BB2020 says yes.
    const result = await unspentSppFor({
      players: [
        playerRow({ sppTotal: 20, moveIncreaseCount: 1, unspentSpp: 5 }),
      ],
      eraRulesSets: [...CRP_ERA, ...BB2020_ERA],
      costs: [...crpCosts(), ...bb2020Costs()],
    });
    expect(result).toMatchObject({
      unspentMin: 5,
      unspentMax: 5,
      cheapestNextCost: 4,
      coversAnother: 'maybe',
      storedVerdict: 'settled',
      storedUnspentSpp: 5,
    });
  });
});

describe('UnspentSppService.modelledForPlayers', () => {
  it('ignores the stored figure', async () => {
    expect(await modelledUnspentSppFor(typePriced(10))).toMatchObject({
      pricingModel: 'kind_priced',
      result: {
        unspentMin: 4,
        unspentMax: 23,
        storedVerdict: 'none_stored',
        storedUnspentSpp: null,
      },
    });
  });

  it('prices against the totals it is given', async () => {
    const modelled = await modelledUnspentSppFor(
      {
        players: [playerRow({ sppTotal: 40 })],
        eraRulesSets: CRP_ERA,
        playerSkills: gainedSkills(3),
        costs: crpCosts(),
      },
      new Map([[1, 50]]),
    );
    expect(modelled).toMatchObject({
      pricingModel: 'fixed_threshold',
      result: { totalSpp: 50, unspentMin: 19, unspentMax: 19 },
    });
  });

  it('reports the pricing model even when the history does not fit', async () => {
    // Seven table rolls cannot fit a six-row CRP table.
    expect(
      await modelledUnspentSppFor({
        players: [playerRow({ sppTotal: 400 })],
        eraRulesSets: CRP_ERA,
        playerSkills: gainedSkills(7),
        costs: crpCosts(),
      }),
    ).toEqual({
      pricingModel: 'fixed_threshold',
      result: { status: 'unknown', reason: 'inconsistent_history' },
    });
  });

  it('has no pricing model when the rules sets disagree or are missing', async () => {
    expect(
      (
        await modelledUnspentSppFor({
          players: [playerRow({ sppTotal: 20 })],
          eraRulesSets: [...CRP_ERA, ...BB2020_ERA],
          costs: [...crpCosts(), ...bb2020Costs()],
        })
      )?.pricingModel,
    ).toBeNull();
    expect(
      (await modelledUnspentSppFor({ players: [playerRow({ sppTotal: 20 })] }))
        ?.pricingModel,
    ).toBeNull();
  });
});
