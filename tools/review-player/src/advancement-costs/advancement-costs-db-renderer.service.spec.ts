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
import { SourceUnspentSppFigureService } from './source-unspent-spp-figure.service';

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

const HISTORY = { playerId: 42 } as AdvancementHistory;

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
      kind: 'trophy',
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

function figure(unspent: number | null) {
  return {
    unspentLabel: 'BBL Unspent SPP',
    unspent,
    totalLabel: 'BBL career SPP (bracketed)',
    reportedTotal: 40,
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
      ],
    }).compile();
    service = moduleRef.get(AdvancementCostsDbRendererService);
  });

  it('lists each advancement with its modelled cost under a kind-priced set', async () => {
    range.model.mockReturnValue(KIND_PRICED);
    range.placement.mockReturnValue('inside');
    figures.figureFor.mockResolvedValue(figure(4));

    const html = await service.render(player);

    expect(history.forPlayers).toHaveBeenCalledWith([42]);
    expect(range.model).toHaveBeenCalledWith(HISTORY);
    expect(html).toContain('<h5>Advancements (BB2020, priced by kind)</h5>');
    expect(html).toContain(
      '<td>Block</td><td>starting</td><td>free</td><td>0 (starting skill)</td>',
    );
    expect(html).toContain(
      '<td>Tentacles</td><td>chosen</td><td>free</td><td>0 (trophy mutation)</td>',
    );
    expect(html).toContain(
      '<td>Guard</td><td>random</td><td>#1</td><td>random_primary_skill: 3<br>random_secondary_skill: 6</td>',
    );
    expect(html).toContain(
      '<td>+ST</td><td>characteristic increase</td><td>#2 (order unknown)</td><td>random_characteristic: 20</td>',
    );
    expect(html).toContain('<td>Stored total SPP</td><td>40</td>');
    expect(html).toContain('<td>Modelled spend</td><td>7 to 38</td>');
    expect(html).toContain('<td>Modelled unspent</td><td>2 to 33</td>');
    expect(html).toContain(
      '<td>BBL Unspent SPP</td><td>4 (inside the modelled range)</td>',
    );
    expect(html).toContain('<td>BBL career SPP (bracketed)</td><td>40</td>');
    expect(html).not.toContain('outside the modelled range (');
    expect(html).not.toContain('class="mismatch');
    expect(html).toContain('stored order, which is unverified');
  });

  it.each([
    ['below', -4],
    ['above', 99],
  ] as const)(
    'highlights a source figure %s the range, in words',
    async (placement, unspent) => {
      range.model.mockReturnValue(KIND_PRICED);
      range.placement.mockReturnValue(placement);
      figures.figureFor.mockResolvedValue(figure(unspent));

      const html = await service.render(player);

      expect(range.placement).toHaveBeenCalledWith(unspent, KIND_PRICED.range);
      expect(html).toContain(
        `<tr class="mismatch"><td>BBL Unspent SPP</td><td class="mismatch-cell">${unspent} — outside the modelled range (${placement} it)</td></tr>`,
      );
    },
  );

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
    expect(html).toContain('has no cost row');
    expect(range.placement).not.toHaveBeenCalled();
  });

  it('shows a single value when the range is exact', async () => {
    range.model.mockReturnValue({
      ...KIND_PRICED,
      range: { spentMin: 31, spentMax: 31, unspentMin: 9, unspentMax: 9 },
    });
    range.placement.mockReturnValue('inside');
    figures.figureFor.mockResolvedValue(figure(9));

    expect(await service.render(player)).toContain(
      '<td>Modelled unspent</td><td>9</td>',
    );
  });

  it('says so when no source figure was read', async () => {
    range.model.mockReturnValue(KIND_PRICED);
    figures.figureFor.mockResolvedValue(null);

    expect(await service.render(player)).toContain(
      '<td>Source figures</td><td>none read</td>',
    );
  });

  it('shows a missing source figure as a dash, without comparing it', async () => {
    range.model.mockReturnValue(KIND_PRICED);
    figures.figureFor.mockResolvedValue({
      ...figure(null),
      reportedTotal: null,
    });

    const html = await service.render(player);

    expect(html).toContain('<td>BBL Unspent SPP</td><td>—</td>');
    expect(html).toContain('<td>BBL career SPP (bracketed)</td><td>—</td>');
    expect(range.placement).not.toHaveBeenCalled();
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
