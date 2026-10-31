import type { UnspentSppSnapshot } from '@blood-bowl-tracker/api-contract';
import { DB } from '@blood-bowl-tracker/db';
import type { MockDbResult } from '@blood-bowl-tracker/db/test-helpers';
import { mockDb } from '@blood-bowl-tracker/db/test-helpers';
import type {
  PlayerSkillSource,
  SkillAccess,
  SkillCategory,
} from '@blood-bowl-tracker/domain-enums';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import {
  extractAllFilterValues,
  firstCallArg,
} from '../shared/query-assertions.test-helpers';
import { AdvancementKindCandidatesService } from './advancement-kind-candidates.service';
import { AdvancementSpendRangeService } from './advancement-spend-range.service';
import { BblSkillSourceInferenceService } from './bbl-skill-source-inference.service';
import { UnspentSppService } from './unspent-spp.service';
import {
  BB2020,
  bb2020Costs,
  BB2025,
  bb2025Costs,
  CRP,
  crpCosts,
} from './unspent-spp.test-helpers';
import type {
  ApplicableAdvancementCost,
  PlayerSkillEntry,
  RulesSetAdvancementInput,
} from './unspent-spp.types';

/** General skills: primary for the position. */
const BLOCK = 101;
const TACKLE = 102;
/** An agility skill: secondary for the position. */
const SIDESTEP = 103;
/** A skill with no recorded category: primary or secondary. */
const UNCATEGORISED = 104;

function gained(
  skillId: number,
  source: PlayerSkillSource = 'advancement',
): PlayerSkillEntry {
  return { skillId, source };
}

/** One rules set's input for a player of the test position. */
function inputFor(
  rulesSetId: number,
  costs: ApplicableAdvancementCost[],
  skills: PlayerSkillEntry[],
): RulesSetAdvancementInput {
  return {
    rulesSetId,
    pricingModel: rulesSetId === CRP ? 'fixed_threshold' : 'kind_priced',
    costs,
    candidatesInput: {
      skills,
      trophyGrantedSkillIds: new Set<number>(),
      characteristicIncreases: 0,
      skillCategories: new Map<number, SkillCategory>([
        [BLOCK, 'general'],
        [TACKLE, 'general'],
        [SIDESTEP, 'agility'],
      ]),
      positionAccess: new Map<SkillCategory, SkillAccess>([
        ['general', 'primary'],
        ['agility', 'secondary'],
      ]),
      costs,
    },
  };
}

const bb2020 = (skills: PlayerSkillEntry[]) =>
  inputFor(BB2020, bb2020Costs(), skills);
const bb2025 = (skills: PlayerSkillEntry[]) =>
  inputFor(BB2025, bb2025Costs(), skills);
const crp = (skills: PlayerSkillEntry[]) => inputFor(CRP, crpCosts(), skills);

/** A BBL snapshot whose total less its unspent figure is `spent`. */
function spending(spent: number): UnspentSppSnapshot {
  return { unspentSpp: 2, snapshotSppTotal: spent + 2 };
}

interface Harness {
  service: BblSkillSourceInferenceService;
  db: MockDbResult;
  unspent: MockProxy<UnspentSppService>;
}

/**
 * The service with the given inputs per player. The candidates and spend
 * range services are pure and dependency-free, so they are passed real.
 */
async function makeService(
  inputs: Map<number, RulesSetAdvancementInput[]>,
): Promise<Harness> {
  const db = mockDb();
  const unspent = mock<UnspentSppService>();
  unspent.advancementInputsForPlayers.mockResolvedValue(inputs);
  const moduleRef = await Test.createTestingModule({
    providers: [
      BblSkillSourceInferenceService,
      AdvancementKindCandidatesService,
      AdvancementSpendRangeService,
      { provide: DB, useValue: db.db },
      { provide: UnspentSppService, useValue: unspent },
    ],
  }).compile();
  return {
    service: moduleRef.get(BblSkillSourceInferenceService),
    db,
    unspent,
  };
}

/** Player 1 with these rules set inputs, spending `spent`. */
async function inferFor(
  rulesSets: RulesSetAdvancementInput[],
  spent: number,
): Promise<Harness> {
  const h = await makeService(new Map([[1, rulesSets]]));
  await h.service.inferSources(new Map([[1, spending(spent)]]));
  return h;
}

/** Each UPDATE's new source and its filter values, in call order. */
function writes(db: MockDbResult): { set: unknown; filter: unknown[] }[] {
  return db.chains.map((chain) => ({
    set: firstCallArg(chain.set),
    filter: extractAllFilterValues(firstCallArg(chain.where)),
  }));
}

describe('BblSkillSourceInferenceService', () => {
  it('issues no query for an empty batch', async () => {
    const h = await makeService(new Map());

    await h.service.inferSources(new Map());

    expect(h.unspent.advancementInputsForPlayers).not.toHaveBeenCalled();
    expect(h.db.chains).toHaveLength(0);
  });

  it("asks for the batch's players", async () => {
    const h = await makeService(new Map());

    await h.service.inferSources(
      new Map([
        [1, spending(3)],
        [2, spending(6)],
      ]),
    );

    expect(h.unspent.advancementInputsForPlayers).toHaveBeenCalledWith([1, 2]);
  });

  it('records a primary skill as random when only a random skill fits the spend', async () => {
    const h = await inferFor([bb2020([gained(BLOCK)])], 3);

    expect(writes(h.db)).toEqual([
      { set: { source: 'random' }, filter: ['advancement', 1, BLOCK] },
    ]);
    expect(h.db.transaction).toHaveBeenCalledTimes(1);
  });

  it('records it as chosen when only a chosen skill fits', async () => {
    const h = await inferFor([bb2020([gained(BLOCK)])], 6);

    expect(writes(h.db)).toEqual([
      { set: { source: 'chosen' }, filter: ['advancement', 1, BLOCK] },
    ]);
  });

  it('tells a primary skill from a secondary one by what each could cost', async () => {
    // Only a random primary (3) then a chosen secondary (14) adds up to 17.
    const h = await inferFor([bb2020([gained(BLOCK), gained(SIDESTEP)])], 17);

    expect(writes(h.db)).toEqual([
      { set: { source: 'chosen' }, filter: ['advancement', 1, SIDESTEP] },
      { set: { source: 'random' }, filter: ['advancement', 1, BLOCK] },
    ]);
  });

  it('settles interchangeable skills when every fit agrees on them', async () => {
    // Two random primaries: 3 + 4.
    const h = await inferFor([bb2020([gained(BLOCK), gained(TACKLE)])], 7);

    expect(writes(h.db)).toEqual([
      {
        set: { source: 'random' },
        filter: ['advancement', 1, BLOCK, 1, TACKLE],
      },
    ]);
  });

  it('leaves interchangeable skills alone when either could be the random one', async () => {
    // A random first (3) and a chosen second (8): nothing says which is which.
    const h = await inferFor([bb2020([gained(BLOCK), gained(TACKLE)])], 11);

    expect(h.db.chains).toHaveLength(0);
  });

  it('leaves a skill alone when fitting assignments disagree on it', async () => {
    // 6 is a chosen primary or a random secondary.
    const h = await inferFor([bb2020([gained(UNCATEGORISED)])], 6);

    expect(h.db.chains).toHaveLength(0);
  });

  it('writes nothing when no assignment fits the spend', async () => {
    const h = await inferFor([bb2020([gained(BLOCK)])], 5);

    expect(h.db.chains).toHaveLength(0);
  });

  it('keeps a recorded source and lets it narrow the others', async () => {
    // Block chosen: 6 + 8 (random secondary) is the only way to reach 14.
    const h = await inferFor(
      [bb2020([gained(BLOCK, 'chosen'), gained(SIDESTEP)])],
      14,
    );

    expect(writes(h.db)).toEqual([
      { set: { source: 'random' }, filter: ['advancement', 1, SIDESTEP] },
    ]);
  });

  it('leaves skills alone when rules sets that both fit disagree', async () => {
    // BB2020 reaches 14 with Block chosen and Sidestep random; BB2025, which
    // has no random secondary skill, with Block random and Sidestep chosen.
    const skills = [gained(BLOCK), gained(SIDESTEP)];
    const h = await inferFor([bb2020(skills), bb2025(skills)], 14);

    expect(h.db.chains).toHaveLength(0);
  });

  it('ignores a rules set the spend does not fit', async () => {
    // BB2020 cannot reach 15; BB2025 only as a random primary then a chosen
    // secondary (3 + 12).
    const skills = [gained(BLOCK), gained(SIDESTEP)];
    const h = await inferFor([bb2020(skills), bb2025(skills)], 15);

    expect(writes(h.db)).toEqual([
      { set: { source: 'chosen' }, filter: ['advancement', 1, SIDESTEP] },
      { set: { source: 'random' }, filter: ['advancement', 1, BLOCK] },
    ]);
  });

  it('skips an era that only prices by fixed thresholds', async () => {
    const h = await inferFor([crp([gained(BLOCK)])], 6);

    expect(h.db.chains).toHaveLength(0);
  });

  it('leaves a skill alone when a fixed-threshold rules set of the era also fits', async () => {
    // BB2020 alone would say chosen (6); CRP's first table roll also costs 6.
    const h = await inferFor(
      [crp([gained(BLOCK)]), bb2020([gained(BLOCK)])],
      6,
    );

    expect(h.db.chains).toHaveLength(0);
  });

  it('skips a player the model has no inputs for', async () => {
    const h = await makeService(new Map());

    await h.service.inferSources(new Map([[1, spending(3)]]));

    expect(h.db.chains).toHaveLength(0);
  });

  it.each([
    ['a negative unspent figure', { unspentSpp: -3, snapshotSppTotal: 0 }],
    [
      'an unspent figure above the career total',
      { unspentSpp: 9, snapshotSppTotal: 6 },
    ],
  ])('skips a snapshot with %s', async (_label, snapshot) => {
    // Either figure would otherwise read as a spend of 3: a random primary.
    const h = await makeService(new Map([[1, [bb2020([gained(BLOCK)])]]]));

    await h.service.inferSources(new Map([[1, snapshot]]));

    expect(h.db.chains).toHaveLength(0);
  });

  it('never writes a starting skill', async () => {
    // A random Block costs 3 either way; the starting Tackle costs nothing.
    const h = await inferFor(
      [bb2020([gained(TACKLE, 'starting'), gained(BLOCK)])],
      3,
    );

    expect(writes(h.db)).toEqual([
      { set: { source: 'random' }, filter: ['advancement', 1, BLOCK] },
    ]);
  });

  it('never writes a skill a trophy granted', async () => {
    // The granted Tackle costs nothing, so its source cannot be told apart.
    const input = bb2020([gained(TACKLE), gained(BLOCK)]);
    input.candidatesInput.trophyGrantedSkillIds = new Set([TACKLE]);
    const h = await inferFor([input], 3);

    expect(writes(h.db)).toEqual([
      { set: { source: 'random' }, filter: ['advancement', 1, BLOCK] },
    ]);
  });

  it('settles each player of a batch on their own spend', async () => {
    const h = await makeService(
      new Map([
        [1, [bb2020([gained(BLOCK)])]],
        [2, [bb2020([gained(BLOCK)])]],
      ]),
    );

    await h.service.inferSources(
      new Map([
        [1, spending(3)],
        [2, spending(6)],
      ]),
    );

    expect(writes(h.db)).toEqual([
      { set: { source: 'chosen' }, filter: ['advancement', 2, BLOCK] },
      { set: { source: 'random' }, filter: ['advancement', 1, BLOCK] },
    ]);
  });
});
