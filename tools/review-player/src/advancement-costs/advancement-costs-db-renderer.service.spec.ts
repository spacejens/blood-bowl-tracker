import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { SampledPlayer } from '../shared/review.types';
import type {
  AdvancementHistory,
  UnspentSppModel,
} from './advancement-cost-model.types';
import { AdvancementCostRangeService } from './advancement-cost-range.service';
import { AdvancementCostsDbRendererService } from './advancement-costs-db-renderer.service';
import { PlayerAdvancementHistoryService } from './player-advancement-history.service';
import { SourceSpendComparisonService } from './source-spend-comparison.service';
import type { SourceUnspentSppFigure } from './source-unspent-spp-figure.service';
import { SourceUnspentSppFigureService } from './source-unspent-spp-figure.service';
import { StoredUnspentSppCheckService } from './stored-unspent-spp-check.service';

const player: SampledPlayer = {
  source: 'bbl',
  playerId: 42,
  externalId: '1020',
  playerName: 'Grim Ironjaw',
  teamName: 'Reikland Reavers',
  positionName: 'Blitzer',
  eraName: 'Third Era',
  selectedFor: ['Random sample'],
};

const HISTORY = { playerId: 42, storedUnspentSpp: null } as AdvancementHistory;

const KIND_PRICED: UnspentSppModel = {
  rulesSetName: 'BB2020',
  fixedThresholds: false,
  rows: [
    {
      label: 'Block',
      kind: 'starting',
      storedSource: 'starting',
      advancementNumber: null,
      candidates: [],
    },
    {
      label: 'Tentacles',
      kind: 'free_extra',
      storedSource: 'chosen',
      advancementNumber: null,
      candidates: [],
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
    },
    {
      label: '+ST',
      kind: 'characteristic',
      storedSource: null,
      advancementNumber: 2,
      candidates: [{ advancementKind: 'random_characteristic', sppCost: 20 }],
      increaseOrder: { known: true, confirmed: false },
    },
  ],
  totalSpp: 40,
  range: { spentMin: 7, spentMax: 38, unspentMin: 2, unspentMax: 33 },
  unknownReason: null,
};

const FIXED: UnspentSppModel = {
  rulesSetName: 'CRP',
  fixedThresholds: true,
  rows: [
    {
      label: 'Dodge',
      kind: 'skill',
      storedSource: 'advancement',
      advancementNumber: 1,
      candidates: [{ advancementKind: 'table_roll', sppCost: 6 }],
    },
    {
      label: 'Fan Favourite',
      kind: 'granted',
      storedSource: 'advancement',
      advancementNumber: 7,
      candidates: [{ advancementKind: 'granted_skill', sppCost: 125 }],
    },
    {
      label: 'Kick',
      kind: 'skill',
      storedSource: 'advancement',
      advancementNumber: 8,
      candidates: [],
    },
  ],
  totalSpp: 400,
  range: null,
  unknownReason: 'unpriced_advancement',
};

function figure(
  unspent: number | null,
  source: 'bbl' | 'tp' = 'bbl',
): SourceUnspentSppFigure {
  return {
    source,
    unspentLabel: 'BBL Unspent SPP',
    unspent,
    totalLabel: 'BBL career SPP (bracketed)',
    reportedTotal: 40,
    spendLabel: 'BBL spent SPP',
  };
}

describe('AdvancementCostsDbRendererService', () => {
  let service: AdvancementCostsDbRendererService;
  let history: MockProxy<PlayerAdvancementHistoryService>;
  let range: MockProxy<AdvancementCostRangeService>;
  let figures: MockProxy<SourceUnspentSppFigureService>;

  beforeEach(async () => {
    history = mock<PlayerAdvancementHistoryService>();
    history.forPlayers.mockResolvedValue(new Map([[42, HISTORY]]));
    range = mock<AdvancementCostRangeService>();
    figures = mock<SourceUnspentSppFigureService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdvancementCostsDbRendererService,
        { provide: PlayerAdvancementHistoryService, useValue: history },
        { provide: AdvancementCostRangeService, useValue: range },
        { provide: SourceUnspentSppFigureService, useValue: figures },
        HtmlService,
        // A pure, dependency-free decision service: passed real so the panel
        // is checked against the same comparison the stratum uses.
        SourceSpendComparisonService,
        StoredUnspentSppCheckService,
      ],
    }).compile();
    service = moduleRef.get(AdvancementCostsDbRendererService);
  });

  it('lists each advancement with its modelled cost under a kind-priced set', async () => {
    range.model.mockReturnValue(KIND_PRICED);
    figures.figureFor.mockResolvedValue(figure(20));

    const html = await service.render(player);

    expect(history.forPlayers).toHaveBeenCalledWith([42]);
    expect(range.model).toHaveBeenCalledWith(HISTORY);
    expect(html).toContain('<h5>Advancements (BB2020, priced by kind)</h5>');
    expect(html).toContain(
      '<td>Block</td><td>starting</td><td>free</td><td>0 (starting skill)</td>',
    );
    expect(html).toContain(
      '<td>Tentacles</td><td>chosen</td><td>free</td><td>0 (free extra skill)</td>',
    );
    expect(html).toContain(
      '<td>Guard</td><td>random</td><td>#1</td><td>random_primary_skill: 3<br>random_secondary_skill: 6</td>',
    );
    expect(html).toContain(
      '<td>+ST</td><td>characteristic increase</td><td>#2</td><td>random_characteristic: 20</td>',
    );
    expect(html).toContain('<td>Stored total SPP</td><td>40</td>');
    expect(html).toContain('<td>Modelled spend</td><td>7 to 38</td>');
    expect(html).toContain('<td>Modelled unspent</td><td>2 to 33</td>');
    expect(html).toContain('<td>BBL career SPP (bracketed)</td><td>40</td>');
    expect(html).toContain('<td>BBL Unspent SPP</td><td>20</td>');
    expect(html).toContain(
      '<td>BBL spent SPP</td><td>20 (inside the modelled spend range)</td>',
    );
    expect(html).not.toContain('outside the modelled spend range (');
    expect(html).not.toContain('class="mismatch');
    expect(html).toContain(
      'characteristic increases are listed in their stored order, which is unverified unless marked confirmed',
    );
    expect(html).toContain(
      'The modelled range in the next table holds for any order and any kind.',
    );
  });

  it.each([
    [
      'an ordered, unconfirmed increase',
      { known: true, confirmed: false },
      '#2</td>',
    ],
    [
      'an increase without a stored order',
      { known: false, confirmed: false },
      '#2 (order unknown)',
    ],
    [
      'a confirmed increase',
      { known: true, confirmed: true },
      '#2 (confirmed)',
    ],
  ])('marks the order of %s', async (_name, increaseOrder, expected) => {
    range.model.mockReturnValue({
      ...KIND_PRICED,
      rows: KIND_PRICED.rows.map((row) =>
        row.kind === 'characteristic' ? { ...row, increaseOrder } : row,
      ),
    });
    figures.figureFor.mockResolvedValue(figure(20));

    const html = await service.render(player);

    expect(html).toContain(`characteristic increase</td><td>${expected}`);
    if (expected === '#2</td>') {
      expect(html).not.toContain('(order unknown)');
      expect(html).not.toContain('(confirmed)');
    }
  });

  it.each([
    ['lower', 33, 7],
    ['upper', 2, 38],
  ] as const)(
    'does not highlight a reported spend at the %s bound',
    async (_bound, unspent, spend) => {
      range.model.mockReturnValue(KIND_PRICED);
      figures.figureFor.mockResolvedValue(figure(unspent));

      const html = await service.render(player);

      expect(html).toContain(
        `<td>BBL spent SPP</td><td>${spend} (inside the modelled spend range)</td>`,
      );
      expect(html).not.toContain('class="mismatch');
    },
  );

  it.each([
    ['below', 34, 6],
    ['above', 1, 39],
  ] as const)(
    'highlights a reported spend %s the modelled spend range, in words',
    async (placement, unspent, spend) => {
      range.model.mockReturnValue(KIND_PRICED);
      figures.figureFor.mockResolvedValue(figure(unspent));

      const html = await service.render(player);

      expect(html).toContain(
        `<tr class="mismatch"><td>BBL spent SPP</td><td class="mismatch-cell">${spend} — outside the modelled spend range (${placement} it)</td></tr>`,
      );
      expect(html).toContain(`<td>BBL Unspent SPP</td><td>${unspent}</td>`);
    },
  );

  it('does not compare a BBL figure under a fixed-threshold rules set', async () => {
    range.model.mockReturnValue({ ...KIND_PRICED, fixedThresholds: true });
    figures.figureFor.mockResolvedValue(figure(1));

    const html = await service.render(player);

    expect(html).toContain(
      '<td>BBL spent SPP</td><td>39 (not compared under this rules set)</td>',
    );
    expect(html).toContain(
      'BBL prices every player at BB2020 costs and recalculates older totals at BB2020 rates, so under a fixed-threshold rules set its figures are never compared; the stored unspent SPP, computed from the stored history, is checked instead.',
    );
    expect(html).not.toContain('class="mismatch');
  });

  function withStored(storedUnspentSpp: number | null): void {
    history.forPlayers.mockResolvedValue(
      new Map([[42, { ...HISTORY, storedUnspentSpp }]]),
    );
  }

  it('shows a stored figure inside the range that matches the source', async () => {
    withStored(20);
    range.model.mockReturnValue(KIND_PRICED);
    figures.figureFor.mockResolvedValue(figure(20));

    expect(await service.render(player)).toContain(
      '<td>Stored unspent SPP</td><td>20 (inside the modelled unspent range; matches the source figure)</td>',
    );
  });

  it('highlights a stored figure outside the range and unlike the source', async () => {
    withStored(40);
    range.model.mockReturnValue(KIND_PRICED);
    figures.figureFor.mockResolvedValue(figure(20));

    expect(await service.render(player)).toContain(
      '<tr class="mismatch"><td>Stored unspent SPP</td><td class="mismatch-cell">40 (above the modelled unspent range, which may mean a gap in the recorded history, a free skill, or an unrecorded order or chosen-or-random choice; differs from the source figure, 20)</td></tr>',
    );
  });

  it('does not compare the stored figure with BBL under fixed thresholds', async () => {
    withStored(20);
    range.model.mockReturnValue({ ...KIND_PRICED, fixedThresholds: true });
    figures.figureFor.mockResolvedValue(figure(1));

    expect(await service.render(player)).toContain(
      '<td>Stored unspent SPP</td><td>20 (inside the modelled unspent range; not compared with the source figure under this rules set)</td>',
    );
  });

  it('says when no unspent SPP is stored', async () => {
    range.model.mockReturnValue(KIND_PRICED);
    figures.figureFor.mockResolvedValue(figure(20));

    expect(await service.render(player)).toContain(
      '<td>Stored unspent SPP</td><td>— (not known exactly)</td>',
    );
  });

  it('compares a TP figure under a fixed-threshold rules set', async () => {
    range.model.mockReturnValue({ ...KIND_PRICED, fixedThresholds: true });
    figures.figureFor.mockResolvedValue(figure(1, 'tp'));

    const html = await service.render(player);

    expect(html).toContain('outside the modelled spend range (above it)');
    expect(html).not.toContain('BBL prices every player');
  });

  it('shows fixed-threshold, house-rule and unpriced rows and the unknown reason', async () => {
    range.model.mockReturnValue(FIXED);
    figures.figureFor.mockResolvedValue(figure(4));

    const html = await service.render(player);

    expect(html).toContain('<h5>Advancements (CRP, fixed thresholds)</h5>');
    expect(html).toContain(
      '<td>Dodge</td><td>advancement</td><td>#1</td><td>6</td>',
    );
    expect(html).toContain(
      '<td>#7 (fixed by league house rule)</td><td>125 (league house rule)</td>',
    );
    expect(html).toContain('<td>#8</td><td>no cost row at this number</td>');
    expect(html).toContain('<td>Modelled spend</td><td>—</td>');
    expect(html).toContain('<td>BBL Unspent SPP</td><td>4</td>');
    expect(html).toContain('<td>BBL spent SPP</td><td>36</td>');
    expect(html).toContain('has no cost row');
    expect(html).toContain(
      'the other numbers shown are one possible order.</p>',
    );
    expect(html).not.toContain('holds for any order');
    expect(html).not.toContain('class="mismatch');
  });

  it('shows a single value when the range is exact', async () => {
    range.model.mockReturnValue({
      ...KIND_PRICED,
      range: { spentMin: 31, spentMax: 31, unspentMin: 9, unspentMax: 9 },
    });
    figures.figureFor.mockResolvedValue(figure(9));

    const html = await service.render(player);

    expect(html).toContain('<td>Modelled spend</td><td>31</td>');
    expect(html).toContain('<td>Modelled unspent</td><td>9</td>');
  });

  it('says so when no source figure was read', async () => {
    range.model.mockReturnValue(KIND_PRICED);
    figures.figureFor.mockResolvedValue(null);

    expect(await service.render(player)).toContain(
      '<td>Source figures</td><td>none read</td>',
    );
  });

  it.each([
    ['unspent figure', figure(null)],
    ['total', { ...figure(99), reportedTotal: null }],
  ])(
    'shows the spend as a dash, without comparing it, when the %s is missing',
    async (_what, reported) => {
      range.model.mockReturnValue(KIND_PRICED);
      figures.figureFor.mockResolvedValue(reported);

      const html = await service.render(player);

      expect(html).toContain('<td>BBL spent SPP</td><td>—</td>');
      expect(html).not.toContain('class="mismatch');
    },
  );

  it('shows a missing unspent figure and total as dashes', async () => {
    range.model.mockReturnValue(KIND_PRICED);
    figures.figureFor.mockResolvedValue({
      ...figure(null),
      reportedTotal: null,
    });

    const html = await service.render(player);

    expect(html).toContain('<td>BBL Unspent SPP</td><td>—</td>');
    expect(html).toContain('<td>BBL career SPP (bracketed)</td><td>—</td>');
    expect(html).toContain('<td>BBL spent SPP</td><td>—</td>');
  });

  it('shows "no cost row" for a granted row with no candidates', async () => {
    range.model.mockReturnValue({
      ...KIND_PRICED,
      rows: [
        {
          label: 'Fan Favourite',
          kind: 'granted',
          storedSource: 'advancement',
          advancementNumber: 7,
          candidates: [],
        },
      ],
    });
    figures.figureFor.mockResolvedValue(null);

    expect(await service.render(player)).toContain(
      '<td>#7 (fixed by league house rule)</td><td>no cost row at this number</td>',
    );
  });

  it.each([
    ['star_player', 'Star players never advance'],
    ['no_total_spp', 'no stored total SPP'],
    ['no_costs', 'has no advancement costs'],
  ] as const)('explains a %s model', async (reason, text) => {
    range.model.mockReturnValue({
      ...KIND_PRICED,
      range: null,
      unknownReason: reason,
      totalSpp: null,
    });
    figures.figureFor.mockResolvedValue(figure(4));

    const html = await service.render(player);

    expect(html).toContain(text);
    expect(html).toContain('<td>Stored total SPP</td><td>—</td>');
  });

  it('shows no advancements table for an era with no rules set', async () => {
    range.model.mockReturnValue({
      ...KIND_PRICED,
      rulesSetName: null,
      rows: [],
      range: null,
      unknownReason: 'no_rules_set',
    });
    figures.figureFor.mockResolvedValue(null);

    const html = await service.render(player);

    expect(html).not.toContain('<h5>Advancements');
    expect(html).toContain('maps to no rules set');
  });

  it('notes a player id with no row', async () => {
    history.forPlayers.mockResolvedValue(new Map());

    expect(await service.render(player)).toBe(
      '<p class="note">No player row with id 42 in the database.</p>',
    );
  });
});
