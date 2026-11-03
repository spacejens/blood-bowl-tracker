import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { BblPlayerInfoRawRendererService } from '../player-info/bbl-player-info-raw-renderer.service';
import { PlayerInfoDbRendererService } from '../player-info/player-info-db-renderer.service';
import { TpPlayerInfoRawRendererService } from '../player-info/tp-player-info-raw-renderer.service';
import { PlayerKeywordsDbRendererService } from '../player-keywords/player-keywords-db-renderer.service';
import { PlayerKeywordsRawRendererService } from '../player-keywords/player-keywords-raw-renderer.service';
import { BblPlayerStatusRawRendererService } from '../player-status/bbl-player-status-raw-renderer.service';
import { PlayerStatusDbRendererService } from '../player-status/player-status-db-renderer.service';
import { TpPlayerStatusRawRendererService } from '../player-status/tp-player-status-raw-renderer.service';
import type { PlayerDataTypeReviewer } from '../shared/data-type-reviewer';
import type { SampledPlayer } from '../shared/review.types';
import { SectionRenderService } from '../shared/section-render.service';
import { PlayerOverviewReviewerService } from './player-overview-reviewer.service';

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

describe('PlayerOverviewReviewerService', () => {
  let service: PlayerOverviewReviewerService;
  let bblInfo: MockProxy<BblPlayerInfoRawRendererService>;
  let tpInfo: MockProxy<TpPlayerInfoRawRendererService>;
  let dbInfo: MockProxy<PlayerInfoDbRendererService>;
  let bblStatus: MockProxy<BblPlayerStatusRawRendererService>;
  let tpStatus: MockProxy<TpPlayerStatusRawRendererService>;
  let dbStatus: MockProxy<PlayerStatusDbRendererService>;
  let rawKeywords: MockProxy<PlayerKeywordsRawRendererService>;
  let dbKeywords: MockProxy<PlayerKeywordsDbRendererService>;
  let sections: MockProxy<SectionRenderService>;

  beforeEach(async () => {
    sections = mock<SectionRenderService>();
    sections.render.mockImplementation((section) => section());
    bblInfo = mock<BblPlayerInfoRawRendererService>();
    tpInfo = mock<TpPlayerInfoRawRendererService>();
    dbInfo = mock<PlayerInfoDbRendererService>();
    bblStatus = mock<BblPlayerStatusRawRendererService>();
    tpStatus = mock<TpPlayerStatusRawRendererService>();
    dbStatus = mock<PlayerStatusDbRendererService>();
    rawKeywords = mock<PlayerKeywordsRawRendererService>();
    dbKeywords = mock<PlayerKeywordsDbRendererService>();
    bblInfo.render.mockResolvedValue('[bbl info]');
    tpInfo.render.mockResolvedValue('[tp info]');
    dbInfo.render.mockResolvedValue('[db info]');
    bblStatus.render.mockResolvedValue('[bbl status]');
    tpStatus.render.mockResolvedValue('[tp status]');
    dbStatus.render.mockResolvedValue('[db status]');
    rawKeywords.render.mockResolvedValue('[raw keywords]');
    dbKeywords.render.mockResolvedValue('[db keywords]');
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayerOverviewReviewerService,
        { provide: BblPlayerInfoRawRendererService, useValue: bblInfo },
        { provide: TpPlayerInfoRawRendererService, useValue: tpInfo },
        { provide: PlayerInfoDbRendererService, useValue: dbInfo },
        { provide: BblPlayerStatusRawRendererService, useValue: bblStatus },
        { provide: TpPlayerStatusRawRendererService, useValue: tpStatus },
        { provide: PlayerStatusDbRendererService, useValue: dbStatus },
        { provide: PlayerKeywordsRawRendererService, useValue: rawKeywords },
        { provide: PlayerKeywordsDbRendererService, useValue: dbKeywords },
        // HtmlService is a pure formatter and is passed real.
        HtmlService,
        { provide: SectionRenderService, useValue: sections },
      ],
    }).compile();
    service = moduleRef.get(PlayerOverviewReviewerService);
  });

  it('identifies itself as the overview panel pair with the default labels', () => {
    const reviewer: PlayerDataTypeReviewer = service;

    expect(reviewer.id).toBe('overview');
    expect(reviewer.rawPanelLabel).toBeUndefined();
    expect(reviewer.importedPanelLabel).toBeUndefined();
  });

  it("stacks a BBL player's identity, status and keywords under subheadings", async () => {
    expect(await service.getRawSource(player)).toBe(
      '<h5>Identity</h5>[bbl info]' +
        '<h5>Status</h5>[bbl status]' +
        '<h5>Keywords (TP template codes and manual curation)</h5>[raw keywords]',
    );
    expect(bblInfo.render).toHaveBeenCalledWith('1000');
    expect(bblStatus.render).toHaveBeenCalledWith('1000');
    expect(rawKeywords.render).toHaveBeenCalledWith(player);
    expect(tpInfo.render).not.toHaveBeenCalled();
    expect(tpStatus.render).not.toHaveBeenCalled();
    expect(sections.render).toHaveBeenCalledTimes(3);
  });

  it("reads a TP player's identity and status from TP", async () => {
    const tpPlayer: SampledPlayer = {
      ...player,
      source: 'tp',
      externalId: '2477481',
    };

    expect(await service.getRawSource(tpPlayer)).toBe(
      '<h5>Identity</h5>[tp info]' +
        '<h5>Status</h5>[tp status]' +
        '<h5>Keywords (TP template codes and manual curation)</h5>[raw keywords]',
    );
    expect(tpInfo.render).toHaveBeenCalledWith('2477481');
    expect(tpStatus.render).toHaveBeenCalledWith('2477481');
    expect(bblInfo.render).not.toHaveBeenCalled();
    expect(sections.render).toHaveBeenCalledTimes(3);
  });

  it('stacks the stored identity, status and position keywords', async () => {
    expect(await service.getImportedView(player)).toBe(
      '<h5>Identity</h5>[db info]' +
        '<h5>Status</h5>[db status]' +
        '<h5>Position keywords</h5>[db keywords]',
    );
    expect(dbInfo.render).toHaveBeenCalledWith(player);
    expect(dbStatus.render).toHaveBeenCalledWith(player);
    expect(dbKeywords.render).toHaveBeenCalledWith(player);
    expect(sections.render).toHaveBeenCalledTimes(3);
  });

  const NOTE = '<p class="note">Rendering failed: boom</p>';

  /** The section at this call position yields the note; the others forward. */
  const failRenderAt = (position: number): void => {
    for (let i = 0; i < position; i++) {
      sections.render.mockImplementationOnce((section) => section());
    }
    sections.render.mockResolvedValueOnce(NOTE);
  };

  it('shows a failure note for a failing BBL raw identity section only', async () => {
    failRenderAt(0);

    expect(await service.getRawSource(player)).toBe(
      '<h5>Identity</h5>' +
        NOTE +
        '<h5>Status</h5>[bbl status]' +
        '<h5>Keywords (TP template codes and manual curation)</h5>[raw keywords]',
    );
  });

  it('shows a failure note for a failing TP raw status section only', async () => {
    const tpPlayer: SampledPlayer = { ...player, source: 'tp' };
    failRenderAt(1);

    expect(await service.getRawSource(tpPlayer)).toBe(
      '<h5>Identity</h5>[tp info]' +
        '<h5>Status</h5>' +
        NOTE +
        '<h5>Keywords (TP template codes and manual curation)</h5>[raw keywords]',
    );
  });

  it('shows a failure note for failing raw keywords only', async () => {
    failRenderAt(2);

    expect(await service.getRawSource(player)).toBe(
      '<h5>Identity</h5>[bbl info]' +
        '<h5>Status</h5>[bbl status]' +
        '<h5>Keywords (TP template codes and manual curation)</h5>' +
        NOTE,
    );
  });

  it('shows a failure note for a failing imported identity section only', async () => {
    failRenderAt(0);

    expect(await service.getImportedView(player)).toBe(
      '<h5>Identity</h5>' +
        NOTE +
        '<h5>Status</h5>[db status]' +
        '<h5>Position keywords</h5>[db keywords]',
    );
  });

  it('shows a failure note for a failing imported status section only', async () => {
    failRenderAt(1);

    expect(await service.getImportedView(player)).toBe(
      '<h5>Identity</h5>[db info]' +
        '<h5>Status</h5>' +
        NOTE +
        '<h5>Position keywords</h5>[db keywords]',
    );
  });

  it('shows a failure note for failing imported keywords only', async () => {
    failRenderAt(2);

    expect(await service.getImportedView(player)).toBe(
      '<h5>Identity</h5>[db info]' +
        '<h5>Status</h5>[db status]' +
        '<h5>Position keywords</h5>' +
        NOTE,
    );
  });
});
