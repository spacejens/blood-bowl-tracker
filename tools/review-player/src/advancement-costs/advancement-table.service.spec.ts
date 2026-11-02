import {
  HtmlService,
  SkillFormatService,
} from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type {
  RawIncreaseMatch,
  RawSkillMatch,
  RawVerdict,
} from '../player-advancements/raw-match.types';
import type {
  ModelledAdvancement,
  StoredIncrease,
  StoredPlayerSkill,
  UnspentSppModel,
} from './advancement-cost-model.types';
import { AdvancementTableService } from './advancement-table.service';

function skill(
  skillName: string,
  source: StoredPlayerSkill['source'],
  extra: Partial<StoredPlayerSkill> = {},
): StoredPlayerSkill {
  return {
    skillId: skillName.length,
    skillName,
    attributeValue: null,
    source,
    advancementOrder: source === 'starting' ? null : 1,
    orderConfirmed: false,
    isFreeExtra: false,
    category: null,
    isElite: false,
    ...extra,
  };
}

const BLOCK = skill('Block', 'starting', { isElite: true });
const TENTACLES = skill('Tentacles', 'chosen', { isFreeExtra: true });
const GUARD = skill('Guard', 'random', { isElite: true });
const HATRED = skill('Hatred', 'advancement', { attributeValue: 'Dwarf' });
const ST: StoredIncrease = {
  characteristic: 'ST',
  advancementOrder: 2,
  orderConfirmed: false,
};

const ROWS: ModelledAdvancement[] = [
  {
    label: 'Block',
    kind: 'starting',
    storedSource: 'starting',
    advancementNumber: null,
    candidates: [],
    skill: BLOCK,
  },
  {
    label: 'Tentacles',
    kind: 'free_extra',
    storedSource: 'chosen',
    advancementNumber: null,
    candidates: [],
    skill: TENTACLES,
  },
  {
    label: 'Guard',
    kind: 'skill',
    storedSource: 'random',
    advancementNumber: 1,
    candidates: [
      { advancementKind: 'random_primary_skill', sppCost: 3 },
      { advancementKind: 'random_secondary_skill', sppCost: 6 },
    ],
    orderConfirmed: false,
    skill: GUARD,
  },
  {
    label: '+ST',
    kind: 'characteristic',
    storedSource: null,
    advancementNumber: 2,
    candidates: [{ advancementKind: 'random_characteristic', sppCost: 20 }],
    increaseOrder: { known: true, confirmed: false },
    increase: ST,
  },
];

const MODEL: UnspentSppModel = {
  rulesSetName: 'BB2020',
  fixedThresholds: false,
  rows: ROWS,
  totalSpp: 40,
  range: { spentMin: 23, spentMax: 26, unspentMin: 14, unspentMax: 17 },
  unknownReason: null,
};

function skillsMatch(
  entries: [StoredPlayerSkill, RawVerdict][],
  rawOnly: string[] = [],
): RawSkillMatch {
  return { verdicts: new Map(entries), rawOnly };
}

function increasesMatch(
  entries: [StoredIncrease, RawVerdict][],
  rawOnly: RawIncreaseMatch['rawOnly'] = [],
): RawIncreaseMatch {
  return { verdicts: new Map(entries), rawOnly };
}

const ALL_YES = {
  skills: skillsMatch([
    [BLOCK, 'yes'],
    [TENTACLES, 'yes'],
    [GUARD, 'yes'],
  ]),
  increases: increasesMatch([[ST, 'yes']]),
};

describe('AdvancementTableService', () => {
  let service: AdvancementTableService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [AdvancementTableService, HtmlService, SkillFormatService],
    }).compile();
    service = moduleRef.get(AdvancementTableService);
  });

  it('lists every stored row once, with order, source, cost and raw verdict', () => {
    const html = service.render({ model: MODEL, ...ALL_YES });

    expect(html).toContain('<h5>Advancements (BB2020, priced by kind)</h5>');
    expect(html).toContain(
      '<th>Order</th><th>Advancement</th><th>Source</th>' +
        '<th>Modelled cost</th><th>Raw source</th>',
    );
    expect(html).toContain(
      '<td>free</td><td>Block</td><td>starting</td>' +
        '<td>0 (starting skill)</td><td>yes</td>',
    );
    expect(html).toContain(
      '<td>free</td><td>Tentacles</td><td>chosen</td>' +
        '<td>0 (free extra skill)</td><td>yes</td>',
    );
    expect(html).toContain(
      '<td>#1</td><td>⚄ ◆ Guard</td><td>random</td>' +
        '<td>random_primary_skill: 3<br>random_secondary_skill: 6</td><td>yes</td>',
    );
    expect(html).toContain(
      '<td>#2</td><td>+ST</td><td>characteristic increase</td>' +
        '<td>random_characteristic: 20</td><td>yes</td>',
    );
    expect(html).not.toContain('class="mismatch');
  });

  it('never marks a starting skill as elite and shows an attribute value', () => {
    const hatredRow: ModelledAdvancement = {
      label: 'Hatred',
      kind: 'skill',
      storedSource: 'advancement',
      advancementNumber: 3,
      candidates: [{ advancementKind: 'chosen_primary_skill', sppCost: 6 }],
      skill: HATRED,
    };

    const html = service.render({
      model: { ...MODEL, rows: [ROWS[0], hatredRow] },
      skills: skillsMatch([
        [BLOCK, 'yes'],
        [HATRED, 'yes'],
      ]),
      increases: increasesMatch([]),
    });

    expect(html).toContain('<td>Block</td>');
    expect(html).toContain('<td>Hatred (Dwarf)</td>');
  });

  it('carries none of the always-on explanations', () => {
    const html = service.render({ model: MODEL, ...ALL_YES });

    expect(html).not.toContain('stored order, which is unverified');
    expect(html).not.toContain('holds for any order and any kind');
    expect(html).not.toContain('<p');
  });

  it('highlights the raw cell of a stored row the raw source lacks', () => {
    const html = service.render({
      model: MODEL,
      skills: skillsMatch([
        [BLOCK, 'yes'],
        [TENTACLES, 'yes'],
        [GUARD, 'not in the raw source'],
      ]),
      increases: increasesMatch([[ST, 'yes']]),
    });

    expect(html).toContain(
      '<tr class="mismatch"><td>#1</td><td>⚄ ◆ Guard</td><td>random</td>' +
        '<td>random_primary_skill: 3<br>random_secondary_skill: 6</td>' +
        '<td class="mismatch-cell">not in the raw source</td></tr>',
    );
  });

  it('appends raw-only skills and markers as highlighted rows', () => {
    const html = service.render({
      model: MODEL,
      skills: skillsMatch(
        [
          [BLOCK, 'yes'],
          [TENTACLES, 'yes'],
          [GUARD, 'yes'],
        ],
        ['Dodge'],
      ),
      increases: increasesMatch(
        [[ST, 'yes']],
        [{ characteristic: 'AV', advancementOrder: 4 }],
      ),
    });

    expect(html).toContain(
      '<tr class="mismatch"><td>—</td><td>Dodge</td><td>—</td><td>—</td>' +
        '<td class="mismatch-cell">in the raw source only</td></tr>',
    );
    expect(html).toContain(
      '<tr class="mismatch"><td>#4</td><td>+AV</td>' +
        '<td>characteristic increase</td><td>—</td>' +
        '<td class="mismatch-cell">in the raw source only</td></tr>',
    );
  });

  it('shows the not-compared and not-read verdicts plainly', () => {
    const html = service.render({
      model: MODEL,
      skills: skillsMatch([
        [BLOCK, 'not read'],
        [TENTACLES, 'not read'],
        [GUARD, 'not read'],
      ]),
      increases: increasesMatch([[ST, 'not compared']]),
    });

    expect(html).toContain('<td>not compared</td>');
    expect(html).toContain('<td>not read</td>');
    expect(html).not.toContain('class="mismatch');
  });

  it('reads not read for a row the match did not cover', () => {
    const html = service.render({
      model: MODEL,
      skills: skillsMatch([]),
      increases: increasesMatch([]),
    });

    expect(html.match(/<td>not read<\/td>/g)).toHaveLength(4);
  });

  it.each([
    [
      'an ordered, unconfirmed increase',
      { known: true, confirmed: false },
      '<td>#2</td><td>+ST</td>',
    ],
    [
      'an increase without a stored order',
      { known: false, confirmed: false },
      '<td>#2 (order unknown)</td>',
    ],
    [
      'a confirmed increase',
      { known: true, confirmed: true },
      '<td>#2 (confirmed)</td>',
    ],
  ])('labels the order of %s', (_name, increaseOrder, expected) => {
    const html = service.render({
      model: {
        ...MODEL,
        rows: MODEL.rows.map((row) =>
          row.kind === 'characteristic' ? { ...row, increaseOrder } : row,
        ),
      },
      ...ALL_YES,
    });

    expect(html).toContain(expected);
  });

  it('marks a confirmed gained skill', () => {
    const html = service.render({
      model: {
        ...MODEL,
        rows: MODEL.rows.map((row) =>
          row.kind === 'skill' ? { ...row, orderConfirmed: true } : row,
        ),
      },
      ...ALL_YES,
    });

    expect(html).toContain('<td>#1 (confirmed)</td>');
  });

  it('highlights the order cell of a clashing confirmed number', () => {
    const html = service.render({
      model: {
        ...MODEL,
        rows: MODEL.rows.map((row) =>
          row.kind === 'skill'
            ? { ...row, orderConfirmed: true, orderClash: true }
            : row,
        ),
        range: null,
        unknownReason: 'order_clash',
      },
      ...ALL_YES,
    });

    expect(html).toContain(
      '<tr class="mismatch"><td class="mismatch-cell">#1 (confirmed), clashes</td>',
    );
  });

  it('shows fixed-threshold, house-rule and unpriced rows', () => {
    const html = service.render({
      model: {
        rulesSetName: 'CRP',
        fixedThresholds: true,
        rows: [
          {
            label: 'Guard',
            kind: 'skill',
            storedSource: 'advancement',
            advancementNumber: 1,
            candidates: [{ advancementKind: 'table_roll', sppCost: 6 }],
            skill: GUARD,
          },
          {
            label: 'Block',
            kind: 'granted',
            storedSource: 'advancement',
            advancementNumber: 7,
            candidates: [{ advancementKind: 'granted_skill', sppCost: 125 }],
            skill: { ...BLOCK, advancementOrder: 7 },
          },
          {
            label: 'Tentacles',
            kind: 'skill',
            storedSource: 'advancement',
            advancementNumber: 8,
            candidates: [],
            skill: TENTACLES,
          },
          {
            label: 'Hatred',
            kind: 'granted',
            storedSource: 'advancement',
            advancementNumber: 9,
            candidates: [],
            skill: HATRED,
          },
        ],
        totalSpp: 200,
        range: null,
        unknownReason: 'unpriced_advancement',
      },
      skills: skillsMatch([]),
      increases: increasesMatch([]),
    });

    expect(html).toContain('<h5>Advancements (CRP, fixed thresholds)</h5>');
    expect(html).toContain(
      '<td>#1</td><td>⚄ ◆ Guard</td><td>advancement</td><td>6</td>',
    );
    expect(html).toContain('<td>#7 (fixed by league house rule)</td>');
    expect(html).toContain('<td>125 (league house rule)</td>');
    expect(html.match(/no cost row at this number/g)).toHaveLength(2);
  });

  it('says so, instead of a table, for an era with no rules set', () => {
    const html = service.render({
      model: {
        ...MODEL,
        rulesSetName: null,
        rows: [],
        range: null,
        unknownReason: 'no_rules_set',
      },
      skills: skillsMatch([]),
      increases: increasesMatch([]),
    });

    expect(html).toBe(
      '<p class="note">The era maps to no rules set, so there is no advancement table.</p>',
    );
  });

  it('reads not read for a row naming neither a skill nor an increase', () => {
    const html = service.render({
      model: {
        ...MODEL,
        rows: [
          {
            label: 'Unknown',
            kind: 'skill',
            storedSource: 'random',
            advancementNumber: 1,
            candidates: [],
          },
        ],
      },
      skills: skillsMatch([]),
      increases: increasesMatch([]),
    });

    expect(html).toContain('<td>not read</td>');
  });

  it.each([
    [
      'a gained skill stored at another order than its number',
      { ...GUARD, advancementOrder: 4 },
      '<td>#3 (stored #4)</td>',
    ],
    [
      'a gained skill with no stored order',
      { ...GUARD, advancementOrder: null },
      '<td>#3 (stored order unknown)</td>',
    ],
    [
      'a gained skill stored at its number',
      { ...GUARD, advancementOrder: 3 },
      '<td>#3</td>',
    ],
  ])('shows the stored order of %s', (_name, stored, expected) => {
    const html = service.render({
      model: {
        ...MODEL,
        rows: [
          {
            label: 'Guard',
            kind: 'skill',
            storedSource: 'random',
            advancementNumber: 3,
            candidates: [],
            orderConfirmed: false,
            skill: stored,
          },
        ],
      },
      skills: skillsMatch([[stored, 'yes']]),
      increases: increasesMatch([]),
    });

    expect(html).toContain(expected);
    if (expected === '<td>#3</td>') {
      expect(html).not.toContain('stored');
    }
  });

  it('shows the stored order of an unconfirmed increase numbered otherwise', () => {
    const stored = { ...ST, advancementOrder: 5 };
    const html = service.render({
      model: {
        ...MODEL,
        rows: [
          {
            label: '+ST',
            kind: 'characteristic',
            storedSource: null,
            advancementNumber: 3,
            candidates: [],
            increaseOrder: { known: true, confirmed: false },
            increase: stored,
          },
        ],
      },
      skills: skillsMatch([]),
      increases: increasesMatch([[stored, 'yes']]),
    });

    expect(html).toContain('<td>#3 (stored #5)</td>');
  });
});
