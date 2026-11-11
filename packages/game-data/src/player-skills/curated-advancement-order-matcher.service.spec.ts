import type { PlayerSkillEntry } from '@blood-bowl-tracker/api-contract';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { CuratedOrderStoredRow } from './curated-advancement-order-matcher.service';
import { CuratedAdvancementOrderMatcherService } from './curated-advancement-order-matcher.service';

function row(
  id: number,
  overrides: Partial<CuratedOrderStoredRow> = {},
): CuratedOrderStoredRow {
  return {
    id,
    skillId: null,
    characteristic: null,
    attributeValue: null,
    source: 'chosen',
    isFreeExtra: false,
    removed: false,
    ...overrides,
  };
}

function skill(
  skillId: number,
  order: number,
  extra: Partial<PlayerSkillEntry> = {},
): PlayerSkillEntry {
  return {
    playerId: 1,
    skillId,
    source: 'advancement',
    advancementOrder: order,
    orderConfirmed: true,
    ...extra,
  };
}

function increase(
  characteristic: 'AG' | 'ST',
  order: number,
): PlayerSkillEntry {
  return {
    playerId: 1,
    source: 'characteristic',
    characteristic,
    advancementOrder: order,
    orderConfirmed: true,
  };
}

describe('CuratedAdvancementOrderMatcherService', () => {
  let matcher: CuratedAdvancementOrderMatcherService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [CuratedAdvancementOrderMatcherService],
    }).compile();
    matcher = moduleRef.get(CuratedAdvancementOrderMatcherService);
  });

  const stored = [
    row(10, { skillId: 7, source: 'starting' }),
    row(11, { skillId: 8 }),
    row(12, { skillId: 9, attributeValue: 'Dwarf', source: 'random' }),
    row(13, { characteristic: 'AG', source: 'characteristic' }),
    row(14, { skillId: 5, isFreeExtra: true }),
    row(15, { characteristic: 'ST', source: 'characteristic', removed: true }),
  ];

  it('returns the paid rows in the curated order, whatever order the entries come in', () => {
    expect(
      matcher.match(
        [
          increase('AG', 2),
          skill(9, 3, { attributeValue: 'Dwarf' }),
          skill(8, 1),
        ],
        stored,
      ),
    ).toEqual({ ok: true, rowIdsInOrder: [11, 13, 12] });
  });

  it('rejects an advancement the player does not have as paid', () => {
    expect(
      matcher.match([skill(7, 1), skill(8, 2), increase('AG', 3)], stored),
    ).toEqual({
      ok: false,
      problem: 'has no paid advancement matching skill 7',
    });
  });

  it('rejects a variant that does not match', () => {
    expect(
      matcher.match(
        [
          skill(8, 1),
          skill(9, 2, { attributeValue: 'Elf' }),
          increase('AG', 3),
        ],
        stored,
      ),
    ).toEqual({
      ok: false,
      problem: 'has no paid advancement matching skill 9 (Elf)',
    });
  });

  it('rejects an entry that leaves a paid advancement out', () => {
    expect(matcher.match([skill(8, 1), increase('AG', 2)], stored)).toEqual({
      ok: false,
      problem: 'has 3 paid advancements, but the entries list 2',
    });
  });

  it('rejects numbers that are not 1 to n', () => {
    expect(
      matcher.match(
        [
          skill(8, 1),
          increase('AG', 3),
          skill(9, 4, { attributeValue: 'Dwarf' }),
        ],
        stored,
      ),
    ).toEqual({
      ok: false,
      problem: 'numbers its advancements 1, 3, 4, not 1 to 3',
    });
  });

  it('rejects an unconfirmed or unnumbered entry', () => {
    expect(
      matcher.match([skill(8, 1, { orderConfirmed: false })], stored),
    ).toEqual({
      ok: false,
      problem: 'lists skill 8 without a confirmed order',
    });
  });

  it('rejects a starting or free entry', () => {
    expect(matcher.match([skill(8, 1, { isFreeExtra: true })], stored)).toEqual(
      {
        ok: false,
        problem: 'lists skill 8, which is not a paid advancement',
      },
    );
  });

  it('rejects an empty list', () => {
    expect(matcher.match([], stored)).toEqual({
      ok: false,
      problem: 'lists no advancements',
    });
  });
});
