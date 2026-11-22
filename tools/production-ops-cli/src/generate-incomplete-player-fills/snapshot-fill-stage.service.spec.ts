import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import type { TpRosterSnapshotVariant } from '../read-tp-roster-snapshots/tp-roster-snapshots.schema';
import { CharacteristicChangeService } from './characteristic-change.service';
import { CharacteristicReplayService } from './characteristic-replay.service';
import { CharacteristicValidityService } from './characteristic-validity.service';
import { FillEntryBuilderService } from './fill-entry-builder.service';
import { candidate, profile } from './fill-plan.test-helpers';
import type {
  SkipReason,
  StatReductionEventRow,
  TeamCompetitionRow,
} from './fill-plan.types';
import { LastingInjuryProofService } from './lasting-injury-proof.service';
import { BB2020_COSTS, costRows } from './pricing.test-helpers';
import { PricingRulesSetsService } from './pricing-rules-sets.service';
import {
  SnapshotFillStageService,
  type SnapshotStageInput,
} from './snapshot-fill-stage.service';
import {
  type OrderSearchOutcome,
  SnapshotOrderSearchService,
  type SnapshotStep,
} from './snapshot-order-search.service';
import {
  type SnapshotSkill,
  SnapshotSkillResolverService,
} from './snapshot-skill-resolver.service';

/** Level 1, Block (96, starting) and Dodge (92), 8 SPP with 2 unspent, position 288. */
const STATE: TpRosterSnapshotVariant = {
  lineUpMasterId: 288,
  level: 1,
  skillMasterIds: [92, 96],
  totalSpp: 8,
  unspentSpp: 2,
  sources: ['e/match_1.json'],
};
const BLOCK: SnapshotSkill = {
  skillId: 100,
  skillName: 'Block',
  nameId: 'Block',
  attributed: false,
};
const DODGE: SnapshotSkill = {
  skillId: 200,
  skillName: 'Dodge',
  nameId: 'Dodge',
  attributed: false,
};
const STEP: SnapshotStep = {
  kind: 'skill',
  skillId: 200,
  skillName: 'Dodge',
  nameId: 'Dodge',
  attributeValue: null,
  selection: 'chosen',
  category: 'primary',
  reportedCost: 6,
};
/** An AV reduction in competition 50, the last his team era played. */
const REDUCTION: StatReductionEventRow = {
  playerId: 1,
  characteristic: 'av',
  competitionId: 50,
  playedAt: '2024-03-01T19:00:00+00:00',
};
const PLAYED: TeamCompetitionRow = {
  playerId: 1,
  competitionId: 50,
  firstPlayedAt: '2024-02-01T19:00:00+00:00',
  lastPlayedAt: '2024-04-01T19:00:00+00:00',
};

function stageInput(
  overrides: Partial<SnapshotStageInput> = {},
): SnapshotStageInput {
  return {
    candidate: candidate({ sppTotal: 8, unspentSpp: 2 }),
    sppTotal: 8,
    status: 'retired',
    hasStatReduction: false,
    reductions: [],
    competitions: [],
    rulesSetsNeverHeal: [false],
    diedAt: null,
    freeSkillRisk: false,
    stored: [],
    profile: profile(),
    skillNames: [{ skillId: 200, skillName: 'Dodge', nameId: 'Dodge' }],
    rulesSetIds: [7],
    costs: costRows(BB2020_COSTS),
    skillCategories: [{ skillId: 200, rulesSetId: 7, category: 'agility' }],
    positionAccess: [
      { positionId: 30, rulesSetId: 7, category: 'agility', access: 'primary' },
    ],
    snapshot: [STATE],
    positionTpIds: ['288'],
    tpSkillIds: [
      { skillId: 200, masterId: '92' },
      { skillId: 100, masterId: '96' },
    ],
    attributedSkillIds: new Set<number>(),
    ...overrides,
  };
}

describe('SnapshotFillStageService', () => {
  let service: SnapshotFillStageService;
  let skills: MockProxy<SnapshotSkillResolverService>;
  let order: MockProxy<SnapshotOrderSearchService>;

  beforeEach(async () => {
    skills = mock<SnapshotSkillResolverService>();
    order = mock<SnapshotOrderSearchService>();
    skills.resolve.mockReturnValue([BLOCK, DODGE]);
    order.search.mockReturnValue({ kind: 'unique', steps: [STEP] });
    const moduleRef = await Test.createTestingModule({
      providers: [
        SnapshotFillStageService,
        { provide: SnapshotSkillResolverService, useValue: skills },
        { provide: SnapshotOrderSearchService, useValue: order },
        // Pure and dependency-free, so passed real, as in the advancement
        // stage's spec: rules-set building, the replay with its change
        // service, the injury proof, validity and the entry builder.
        PricingRulesSetsService,
        CharacteristicReplayService,
        CharacteristicChangeService,
        LastingInjuryProofService,
        CharacteristicValidityService,
        FillEntryBuilderService,
      ],
    }).compile();
    service = moduleRef.get(SnapshotFillStageService);
  });

  function reasonFor(input: SnapshotStageInput): SkipReason | undefined {
    const decision = service.decide(input);
    return 'reason' in decision ? decision.reason : undefined;
  }

  it("fills the player with his snapshot's gained skill, in the order found", () => {
    expect(service.decide(stageInput())).toEqual({
      entry: {
        player: { system: 'tourplay.net', id: '500' },
        status: 'retired',
        characteristics: { ma: 6, st: 3, ag: 3, pa: 4, av: 9 },
        sppTotal: 8,
        unspentSpp: 2,
        startingSkills: [{ system: 'Name', id: 'Block' }],
        advancements: [
          { skill: { system: 'Name', id: 'Dodge' }, source: 'chosen' },
        ],
      },
    });
  });

  it('resolves the snapshot ids and searches the gained skills against the spend', () => {
    const input = stageInput();
    service.decide(input);

    expect(skills.resolve).toHaveBeenCalledWith({
      masterIds: [92, 96],
      tpSkillIds: input.tpSkillIds,
      skillNames: input.skillNames,
      attributedSkillIds: input.attributedSkillIds,
    });
    expect(order.search).toHaveBeenCalledTimes(1);
    const [search] = order.search.mock.calls[0];
    expect(search.skills).toEqual([
      { skillId: 200, skillName: 'Dodge', nameId: 'Dodge' },
    ]);
    expect(search.rulesSets.map((rulesSet) => rulesSet.rulesSetId)).toEqual([
      7,
    ]);
    expect(search.spent).toBe(6);
  });

  it('fills a level 0 player whose spend is 0 with no advancements', () => {
    skills.resolve.mockReturnValue([BLOCK]);
    order.search.mockReturnValue({ kind: 'unique', steps: [] });
    const decision = service.decide(
      stageInput({
        snapshot: [{ ...STATE, level: 0, skillMasterIds: [96], unspentSpp: 8 }],
        candidate: candidate({ sppTotal: 8, unspentSpp: 8 }),
      }),
    );

    expect('entry' in decision && decision.entry.advancements).toEqual([]);
    expect('entry' in decision && decision.entry.unspentSpp).toBe(8);
  });

  it('accepts a stored unspent SPP that equals the snapshot', () => {
    expect(reasonFor(stageInput())).toBeUndefined();
  });

  it("skips a player with no stored unspent SPP rather than take the snapshot's", () => {
    expect(
      reasonFor(
        stageInput({ candidate: candidate({ sppTotal: 8, unspentSpp: null }) }),
      ),
    ).toBe('unspent-spp-missing');
    expect(order.search).not.toHaveBeenCalled();
  });

  it('applies reductions that certainly last to the line', () => {
    const decision = service.decide(
      stageInput({
        hasStatReduction: true,
        reductions: [REDUCTION],
        competitions: [PLAYED],
      }),
    );

    expect('entry' in decision && decision.entry.characteristics.av).toBe(8);
  });

  it.each<[string, Partial<SnapshotStageInput>, SkipReason]>([
    ['no file shows him', { snapshot: undefined }, 'snapshot-missing'],
    ['his record lists no state', { snapshot: [] }, 'snapshot-missing'],
    [
      'his files disagree',
      { snapshot: [STATE, { ...STATE, totalSpp: 9 }] },
      'snapshot-disagrees',
    ],
    [
      'the snapshot total differs',
      { snapshot: [{ ...STATE, totalSpp: 9 }] },
      'snapshot-conflicts-stored',
    ],
    [
      'the stored unspent SPP differs',
      { candidate: candidate({ sppTotal: 8, unspentSpp: 3 }) },
      'snapshot-conflicts-stored',
    ],
    [
      'the snapshot position differs',
      { positionTpIds: ['289'] },
      'snapshot-conflicts-stored',
    ],
    [
      'the unspent SPP is above the total',
      {
        snapshot: [{ ...STATE, unspentSpp: 9 }],
        candidate: candidate({ sppTotal: 8, unspentSpp: 9 }),
      },
      'spp-does-not-add-up',
    ],
    [
      'the unspent SPP is negative',
      {
        snapshot: [{ ...STATE, unspentSpp: -1 }],
        candidate: candidate({ sppTotal: 8, unspentSpp: -1 }),
      },
      'spp-does-not-add-up',
    ],
    [
      'his reductions may have healed',
      { hasStatReduction: true, reductions: [] },
      'lasting-injury-uncertain',
    ],
    ['he has a free-skill risk', { freeSkillRisk: true }, 'free-skill-risk'],
    [
      'his position is not certain',
      { profile: undefined },
      'position-ambiguous',
    ],
    [
      'he has more levels than gained skills',
      { snapshot: [{ ...STATE, level: 2 }] },
      'snapshot-characteristic-increase',
    ],
    [
      'he has fewer levels than gained skills',
      { snapshot: [{ ...STATE, level: 0 }] },
      'snapshot-level-mismatch',
    ],
    [
      'his position gives a category two accesses',
      {
        positionAccess: [
          {
            positionId: 30,
            rulesSetId: 7,
            category: 'agility',
            access: 'primary',
          },
          {
            positionId: 30,
            rulesSetId: 7,
            category: 'agility',
            access: 'secondary',
          },
        ],
      },
      'skill-category-mismatch',
    ],
  ])('skips him when %s', (_case, overrides, reason) => {
    expect(reasonFor(stageInput(overrides))).toBe(reason);
  });

  it('skips him when a snapshot id resolves to no single skill', () => {
    skills.resolve.mockReturnValue(undefined);

    expect(reasonFor(stageInput())).toBe('skill-unresolved');
  });

  it.each<[string, SnapshotSkill]>([
    ['has no single Name id', { ...DODGE, nameId: null, skillName: null }],
    ['is held with a variant somewhere', { ...DODGE, attributed: true }],
  ])('skips him when a gained skill %s', (_case, skill) => {
    skills.resolve.mockReturnValue([BLOCK, skill]);

    expect(reasonFor(stageInput())).toBe('skill-unresolved');
  });

  it('does not ask a starting skill for a Name id or a plain variant', () => {
    skills.resolve.mockReturnValue([
      { ...BLOCK, nameId: null, skillName: null, attributed: true },
      DODGE,
    ]);

    expect(reasonFor(stageInput())).toBeUndefined();
  });

  it('skips him when a gained skill repeats', () => {
    skills.resolve.mockReturnValue([BLOCK, DODGE, DODGE]);

    expect(reasonFor(stageInput({ snapshot: [{ ...STATE, level: 2 }] }))).toBe(
      'duplicate-skill',
    );
    expect(order.search).not.toHaveBeenCalled();
  });

  it('skips him when the snapshot shows a starting skill more often than his position has it', () => {
    skills.resolve.mockReturnValue([BLOCK, BLOCK, DODGE]);

    expect(reasonFor(stageInput({ snapshot: [{ ...STATE, level: 2 }] }))).toBe(
      'duplicate-skill',
    );
  });

  it('skips him when the snapshot lacks a starting skill of his position', () => {
    skills.resolve.mockReturnValue([DODGE]);

    expect(reasonFor(stageInput())).toBe('snapshot-conflicts-stored');
  });

  it.each(['Loner', 'Hatred'])(
    'skips him when he gained a Loner or a Hatred (%s)',
    (name) => {
      skills.resolve.mockReturnValue([
        BLOCK,
        { ...DODGE, skillName: name, nameId: name },
      ]);

      expect(reasonFor(stageInput())).toBe('free-skill-risk');
    },
  );

  it('skips him when he gained more than six skills, without searching their orders', () => {
    const gained = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
      ...DODGE,
      skillId: 200 + n,
    }));
    skills.resolve.mockReturnValue([BLOCK, ...gained]);

    expect(reasonFor(stageInput({ snapshot: [{ ...STATE, level: 7 }] }))).toBe(
      'too-many-advancements',
    );
    expect(order.search).not.toHaveBeenCalled();
  });

  it('searches the orders of exactly six gained skills', () => {
    const gained = [1, 2, 3, 4, 5, 6].map((n) => ({
      ...DODGE,
      skillId: 200 + n,
    }));
    skills.resolve.mockReturnValue([BLOCK, ...gained]);
    order.search.mockReturnValue({ kind: 'ambiguous' });

    expect(reasonFor(stageInput({ snapshot: [{ ...STATE, level: 6 }] }))).toBe(
      'snapshot-order-ambiguous',
    );
    expect(order.search.mock.calls[0][0].skills).toHaveLength(6);
  });

  it.each<[OrderSearchOutcome, SkipReason]>([
    [{ kind: 'none' }, 'snapshot-spend-mismatch'],
    [{ kind: 'ambiguous' }, 'snapshot-order-ambiguous'],
    [{ kind: 'granted-skill' }, 'free-skill-risk'],
    [{ kind: 'category-mismatch' }, 'skill-category-mismatch'],
    [{ kind: 'disagree' }, 'rules-sets-disagree'],
  ])('reports an order search of %o as %s', (outcome, reason) => {
    order.search.mockReturnValue(outcome);

    expect(reasonFor(stageInput())).toBe(reason);
  });

  it('skips him when stored data contradicts the entry', () => {
    expect(
      reasonFor(
        stageInput({
          candidate: candidate({ sppTotal: 8, unspentSpp: 2, move: 5 }),
        }),
      ),
    ).toBe('stored-data-contradicts');
  });

  it('skips him when his line is not valid', () => {
    expect(
      reasonFor(
        stageInput({
          profile: profile({ line: { ma: 0, st: 3, ag: 3, pa: 4, av: 9 } }),
        }),
      ),
    ).toBe('invalid-characteristics');
  });
});
