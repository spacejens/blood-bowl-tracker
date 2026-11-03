import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { AdvancementsDbRendererService } from '../advancement-costs/advancements-db-renderer.service';
import { BblLastingInjuriesRawRendererService } from '../lasting-injuries/bbl-lasting-injuries-raw-renderer.service';
import { LastingInjuriesDbRendererService } from '../lasting-injuries/lasting-injuries-db-renderer.service';
import { TpLastingInjuriesRawRendererService } from '../lasting-injuries/tp-lasting-injuries-raw-renderer.service';
import { BblPlayerAdvancementsRawRendererService } from '../player-advancements/bbl-player-advancements-raw-renderer.service';
import { TpPlayerAdvancementsRawRendererService } from '../player-advancements/tp-player-advancements-raw-renderer.service';
import { BblPlayerCharacteristicsRawRendererService } from '../player-characteristics/bbl-player-characteristics-raw-renderer.service';
import { PlayerCharacteristicsDbRendererService } from '../player-characteristics/player-characteristics-db-renderer.service';
import { TpPlayerCharacteristicsRawRendererService } from '../player-characteristics/tp-player-characteristics-raw-renderer.service';
import type { PlayerDataTypeReviewer } from '../shared/data-type-reviewer';
import type { SampledPlayer } from '../shared/review.types';
import { SectionRenderService } from '../shared/section-render.service';
import type { PlayerSppTotals } from '../spp-totals/player-spp-lookup.service';
import { PlayerSppLookupService } from '../spp-totals/player-spp-lookup.service';
import { PlayerSppTotalsRendererService } from '../spp-totals/player-spp-totals-renderer.service';
import { PlayerCareerHistoryReviewerService } from './player-career-history-reviewer.service';

const player: SampledPlayer = {
  source: 'bbl',
  playerId: 42,
  externalId: '1000',
  playerName: 'Janhorgh',
  teamName: 'Bockar',
  positionName: 'Lineman',
  eraName: 'Third Era',
  selectedFor: ['Random sample'],
};

const TOTALS = { computedTotal: 16 } as PlayerSppTotals;

describe('PlayerCareerHistoryReviewerService', () => {
  let service: PlayerCareerHistoryReviewerService;
  let bblAdvancements: MockProxy<BblPlayerAdvancementsRawRendererService>;
  let tpAdvancements: MockProxy<TpPlayerAdvancementsRawRendererService>;
  let bblCharacteristics: MockProxy<BblPlayerCharacteristicsRawRendererService>;
  let tpCharacteristics: MockProxy<TpPlayerCharacteristicsRawRendererService>;
  let bblInjuries: MockProxy<BblLastingInjuriesRawRendererService>;
  let tpInjuries: MockProxy<TpLastingInjuriesRawRendererService>;
  let sppLookup: MockProxy<PlayerSppLookupService>;
  let sppTotals: MockProxy<PlayerSppTotalsRendererService>;
  let advancements: MockProxy<AdvancementsDbRendererService>;
  let characteristics: MockProxy<PlayerCharacteristicsDbRendererService>;
  let injuries: MockProxy<LastingInjuriesDbRendererService>;
  let sections: MockProxy<SectionRenderService>;

  beforeEach(async () => {
    sections = mock<SectionRenderService>();
    sections.render.mockImplementation((section) => section());
    sections.renderPair.mockImplementation((section) => section());
    bblAdvancements = mock<BblPlayerAdvancementsRawRendererService>();
    tpAdvancements = mock<TpPlayerAdvancementsRawRendererService>();
    bblCharacteristics = mock<BblPlayerCharacteristicsRawRendererService>();
    tpCharacteristics = mock<TpPlayerCharacteristicsRawRendererService>();
    bblInjuries = mock<BblLastingInjuriesRawRendererService>();
    tpInjuries = mock<TpLastingInjuriesRawRendererService>();
    sppLookup = mock<PlayerSppLookupService>();
    sppTotals = mock<PlayerSppTotalsRendererService>();
    advancements = mock<AdvancementsDbRendererService>();
    characteristics = mock<PlayerCharacteristicsDbRendererService>();
    injuries = mock<LastingInjuriesDbRendererService>();
    bblAdvancements.render.mockResolvedValue('[bbl advancements]');
    tpAdvancements.render.mockResolvedValue('[tp advancements]');
    bblCharacteristics.render.mockResolvedValue('[bbl characteristics]');
    tpCharacteristics.render.mockResolvedValue('[tp characteristics]');
    bblInjuries.render.mockResolvedValue('[bbl injuries]');
    tpInjuries.render.mockResolvedValue('[tp injuries]');
    sppLookup.load.mockResolvedValue(TOTALS);
    sppTotals.render.mockReturnValue('[spp]');
    advancements.render.mockResolvedValue({
      advancements: '[advancements]',
      unspentSpp: '[unspent]',
    });
    characteristics.render.mockResolvedValue('[characteristics]');
    injuries.render.mockResolvedValue('[injuries]');
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayerCareerHistoryReviewerService,
        {
          provide: BblPlayerAdvancementsRawRendererService,
          useValue: bblAdvancements,
        },
        {
          provide: TpPlayerAdvancementsRawRendererService,
          useValue: tpAdvancements,
        },
        {
          provide: BblPlayerCharacteristicsRawRendererService,
          useValue: bblCharacteristics,
        },
        {
          provide: TpPlayerCharacteristicsRawRendererService,
          useValue: tpCharacteristics,
        },
        {
          provide: BblLastingInjuriesRawRendererService,
          useValue: bblInjuries,
        },
        { provide: TpLastingInjuriesRawRendererService, useValue: tpInjuries },
        { provide: PlayerSppLookupService, useValue: sppLookup },
        { provide: PlayerSppTotalsRendererService, useValue: sppTotals },
        { provide: AdvancementsDbRendererService, useValue: advancements },
        {
          provide: PlayerCharacteristicsDbRendererService,
          useValue: characteristics,
        },
        { provide: LastingInjuriesDbRendererService, useValue: injuries },
        // HtmlService is a pure formatter and is passed real.
        HtmlService,
        { provide: SectionRenderService, useValue: sections },
      ],
    }).compile();
    service = moduleRef.get(PlayerCareerHistoryReviewerService);
  });

  it('identifies itself as the career-history panel pair with the default labels', () => {
    const reviewer: PlayerDataTypeReviewer = service;

    expect(reviewer.id).toBe('career-history');
    expect(reviewer.rawPanelLabel).toBeUndefined();
    expect(reviewer.importedPanelLabel).toBeUndefined();
  });

  it("stacks a BBL player's advancements, characteristics and injuries", async () => {
    expect(await service.getRawSource(player)).toBe(
      '[bbl advancements]' +
        '<h5>Characteristics</h5>[bbl characteristics]' +
        '<h5>Lasting injuries</h5>[bbl injuries]',
    );
    expect(bblAdvancements.render).toHaveBeenCalledWith('1000');
    expect(bblCharacteristics.render).toHaveBeenCalledWith('1000');
    expect(bblInjuries.render).toHaveBeenCalledWith('1000');
    expect(tpAdvancements.render).not.toHaveBeenCalled();
    expect(sections.render).toHaveBeenCalledTimes(3);
  });

  it("reads a TP player's record from TP", async () => {
    const tpPlayer: SampledPlayer = {
      ...player,
      source: 'tp',
      externalId: '2477481',
    };

    expect(await service.getRawSource(tpPlayer)).toBe(
      '[tp advancements]' +
        '<h5>Characteristics</h5>[tp characteristics]' +
        '<h5>Lasting injuries</h5>[tp injuries]',
    );
    expect(tpAdvancements.render).toHaveBeenCalledWith('2477481');
    expect(tpCharacteristics.render).toHaveBeenCalledWith('2477481');
    expect(tpInjuries.render).toHaveBeenCalledWith('2477481');
    expect(bblAdvancements.render).not.toHaveBeenCalled();
    expect(sections.render).toHaveBeenCalledTimes(3);
  });

  it('stacks the stored SPP, advancements, characteristics, injuries and unspent SPP in that order', async () => {
    expect(await service.getImportedView(player)).toBe(
      '<h5>SPP total</h5>[spp]' +
        '[advancements]' +
        '<h5>Characteristics (against position baseline)</h5>[characteristics]' +
        '<h5>Lasting injuries</h5>[injuries]' +
        '[unspent]',
    );
    expect(sppLookup.load).toHaveBeenCalledWith(player);
    expect(sppTotals.render).toHaveBeenCalledWith(TOTALS);
    expect(advancements.render).toHaveBeenCalledWith(player);
    expect(characteristics.render).toHaveBeenCalledWith(player);
    expect(injuries.render).toHaveBeenCalledWith(player);
    expect(sections.render).toHaveBeenCalledTimes(3);
    expect(sections.renderPair).toHaveBeenCalledTimes(1);
  });

  const NOTE = '<p class="note">Rendering failed: boom</p>';

  /** The section at this call position yields the note; the others forward. */
  const failRenderAt = (position: number): void => {
    for (let i = 0; i < position; i++) {
      sections.render.mockImplementationOnce((section) => section());
    }
    sections.render.mockResolvedValueOnce(NOTE);
  };

  it('shows a failure note for a failing BBL raw advancements section only', async () => {
    failRenderAt(0);

    expect(await service.getRawSource(player)).toBe(
      NOTE +
        '<h5>Characteristics</h5>[bbl characteristics]' +
        '<h5>Lasting injuries</h5>[bbl injuries]',
    );
  });

  it('shows a failure note for a failing BBL raw characteristics section only', async () => {
    failRenderAt(1);

    expect(await service.getRawSource(player)).toBe(
      '[bbl advancements]' +
        '<h5>Characteristics</h5>' +
        NOTE +
        '<h5>Lasting injuries</h5>[bbl injuries]',
    );
  });

  it('shows a failure note for a failing BBL raw injuries section only', async () => {
    failRenderAt(2);

    expect(await service.getRawSource(player)).toBe(
      '[bbl advancements]' +
        '<h5>Characteristics</h5>[bbl characteristics]' +
        '<h5>Lasting injuries</h5>' +
        NOTE,
    );
  });

  it('contains a TP raw failure to its own section', async () => {
    const tpPlayer: SampledPlayer = { ...player, source: 'tp' };
    sections.render.mockResolvedValueOnce(NOTE);
    sections.render.mockImplementationOnce((section) => section());
    sections.render.mockResolvedValueOnce(NOTE);

    expect(await service.getRawSource(tpPlayer)).toBe(
      NOTE +
        '<h5>Characteristics</h5>[tp characteristics]' +
        '<h5>Lasting injuries</h5>' +
        NOTE,
    );
  });

  it('shows a failure note for a failing SPP lookup section only', async () => {
    failRenderAt(0);

    expect(await service.getImportedView(player)).toBe(
      '<h5>SPP total</h5>' +
        NOTE +
        '[advancements]' +
        '<h5>Characteristics (against position baseline)</h5>[characteristics]' +
        '<h5>Lasting injuries</h5>[injuries]' +
        '[unspent]',
    );
  });

  it('shows a failure note in both the advancements and unspent SPP slots when advancements fail', async () => {
    sections.renderPair.mockResolvedValueOnce([NOTE, NOTE]);

    expect(await service.getImportedView(player)).toBe(
      '<h5>SPP total</h5>[spp]' +
        NOTE +
        '<h5>Characteristics (against position baseline)</h5>[characteristics]' +
        '<h5>Lasting injuries</h5>[injuries]' +
        NOTE,
    );
  });

  it('shows a failure note for a failing imported characteristics section only', async () => {
    failRenderAt(1);

    expect(await service.getImportedView(player)).toBe(
      '<h5>SPP total</h5>[spp]' +
        '[advancements]' +
        '<h5>Characteristics (against position baseline)</h5>' +
        NOTE +
        '<h5>Lasting injuries</h5>[injuries]' +
        '[unspent]',
    );
  });

  it('shows a failure note for a failing imported injuries section only', async () => {
    failRenderAt(2);

    expect(await service.getImportedView(player)).toBe(
      '<h5>SPP total</h5>[spp]' +
        '[advancements]' +
        '<h5>Characteristics (against position baseline)</h5>[characteristics]' +
        '<h5>Lasting injuries</h5>' +
        NOTE +
        '[unspent]',
    );
  });
});
