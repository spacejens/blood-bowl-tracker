import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { SampledStarPlayer } from '../shared/review.types';
import { SectionRenderService } from '../shared/section-render.service';
import { StarPlayerCharacteristicsDbRendererService } from '../star-player-characteristics/characteristics-db-renderer.service';
import { StarPlayerCharacteristicsRawRendererService } from '../star-player-characteristics/characteristics-raw-renderer.service';
import { StarPlayerIdentityDbRendererService } from '../star-player-identity/identity-db-renderer.service';
import { StarPlayerIdentityRawRendererService } from '../star-player-identity/identity-raw-renderer.service';
import { StarPlayerKeywordsDbRendererService } from '../star-player-keywords/star-player-keywords-db-renderer.service';
import { StarPlayerKeywordsRawRendererService } from '../star-player-keywords/star-player-keywords-raw-renderer.service';
import { StarPlayerSkillsDbRendererService } from '../star-player-skills/star-player-skills-db-renderer.service';
import { StarPlayerSkillsRawRendererService } from '../star-player-skills/star-player-skills-raw-renderer.service';
import { StarPlayerReviewerService } from './star-player-reviewer.service';

const star: SampledStarPlayer = {
  positionId: 5,
  positionName: 'Eldril Sidewinder',
  selectedFor: ['Random sample'],
};

const NOTE = '<p class="note">Rendering failed: boom</p>';

describe('StarPlayerReviewerService', () => {
  let service: StarPlayerReviewerService;
  let rawIdentity: MockProxy<StarPlayerIdentityRawRendererService>;
  let dbIdentity: MockProxy<StarPlayerIdentityDbRendererService>;
  let rawCharacteristics: MockProxy<StarPlayerCharacteristicsRawRendererService>;
  let dbCharacteristics: MockProxy<StarPlayerCharacteristicsDbRendererService>;
  let rawSkills: MockProxy<StarPlayerSkillsRawRendererService>;
  let dbSkills: MockProxy<StarPlayerSkillsDbRendererService>;
  let rawKeywords: MockProxy<StarPlayerKeywordsRawRendererService>;
  let dbKeywords: MockProxy<StarPlayerKeywordsDbRendererService>;
  let sections: MockProxy<SectionRenderService>;

  beforeEach(async () => {
    sections = mock<SectionRenderService>();
    sections.render.mockImplementation((section) => section());
    rawIdentity = mock<StarPlayerIdentityRawRendererService>();
    dbIdentity = mock<StarPlayerIdentityDbRendererService>();
    rawCharacteristics = mock<StarPlayerCharacteristicsRawRendererService>();
    dbCharacteristics = mock<StarPlayerCharacteristicsDbRendererService>();
    rawSkills = mock<StarPlayerSkillsRawRendererService>();
    dbSkills = mock<StarPlayerSkillsDbRendererService>();
    rawKeywords = mock<StarPlayerKeywordsRawRendererService>();
    dbKeywords = mock<StarPlayerKeywordsDbRendererService>();
    rawIdentity.render.mockResolvedValue('[raw identity]');
    dbIdentity.render.mockResolvedValue('[db identity]');
    rawCharacteristics.render.mockResolvedValue('[raw characteristics]');
    dbCharacteristics.render.mockResolvedValue('[db characteristics]');
    rawSkills.render.mockResolvedValue('[raw skills]');
    dbSkills.render.mockResolvedValue('[db skills]');
    rawKeywords.render.mockResolvedValue('[raw keywords]');
    dbKeywords.render.mockResolvedValue('[db keywords]');
    const moduleRef = await Test.createTestingModule({
      providers: [
        StarPlayerReviewerService,
        {
          provide: StarPlayerIdentityRawRendererService,
          useValue: rawIdentity,
        },
        { provide: StarPlayerIdentityDbRendererService, useValue: dbIdentity },
        {
          provide: StarPlayerCharacteristicsRawRendererService,
          useValue: rawCharacteristics,
        },
        {
          provide: StarPlayerCharacteristicsDbRendererService,
          useValue: dbCharacteristics,
        },
        { provide: StarPlayerSkillsRawRendererService, useValue: rawSkills },
        { provide: StarPlayerSkillsDbRendererService, useValue: dbSkills },
        {
          provide: StarPlayerKeywordsRawRendererService,
          useValue: rawKeywords,
        },
        { provide: StarPlayerKeywordsDbRendererService, useValue: dbKeywords },
        // HtmlService is a pure formatter and is passed real.
        HtmlService,
        { provide: SectionRenderService, useValue: sections },
      ],
    }).compile();
    service = moduleRef.get(StarPlayerReviewerService);
  });

  /** The section at this call position yields the note; the others forward. */
  const failRenderAt = (position: number): void => {
    for (let i = 0; i < position; i++) {
      sections.render.mockImplementationOnce((section) => section());
    }
    sections.render.mockResolvedValueOnce(NOTE);
  };

  it('identifies itself as the star-player panel pair with its labels', () => {
    expect(service.id).toBe('star-player');
    expect(service.rawPanelLabel).toBe(
      'Raw sources (BBL / TP / manual curation)',
    );
    expect(service.importedPanelLabel).toBe('Imported (database)');
  });

  it('stacks the raw identity, characteristics, skills and keywords in order', async () => {
    expect(await service.getRawSource(star)).toBe(
      '[raw identity][raw characteristics][raw skills][raw keywords]',
    );
    expect(rawIdentity.render).toHaveBeenCalledWith(star);
    expect(rawCharacteristics.render).toHaveBeenCalledWith(star);
    expect(rawSkills.render).toHaveBeenCalledWith(star);
    expect(rawKeywords.render).toHaveBeenCalledWith(star);
    expect(sections.render).toHaveBeenCalledTimes(4);
  });

  it('stacks the stored aspects under plain aspect sub-headings', async () => {
    expect(await service.getImportedView(star)).toBe(
      '<h5>Identity</h5>[db identity]' +
        '<h5>Characteristics</h5>[db characteristics]' +
        '<h5>Starting skills</h5>[db skills]' +
        '<h5>Keywords</h5>[db keywords]',
    );
    expect(dbIdentity.render).toHaveBeenCalledWith(star);
    expect(dbCharacteristics.render).toHaveBeenCalledWith(star);
    expect(dbSkills.render).toHaveBeenCalledWith(star);
    expect(dbKeywords.render).toHaveBeenCalledWith(star);
    expect(sections.render).toHaveBeenCalledTimes(4);
  });

  it('shows a failure note in place of a failing raw identity section only', async () => {
    failRenderAt(0);

    expect(await service.getRawSource(star)).toBe(
      NOTE + '[raw characteristics][raw skills][raw keywords]',
    );
  });

  it('shows a failure note in place of failing raw characteristics only', async () => {
    failRenderAt(1);

    expect(await service.getRawSource(star)).toBe(
      '[raw identity]' + NOTE + '[raw skills][raw keywords]',
    );
  });

  it('shows a failure note in place of failing raw skills only', async () => {
    failRenderAt(2);

    expect(await service.getRawSource(star)).toBe(
      '[raw identity][raw characteristics]' + NOTE + '[raw keywords]',
    );
  });

  it('shows a failure note in place of failing raw keywords only', async () => {
    failRenderAt(3);

    expect(await service.getRawSource(star)).toBe(
      '[raw identity][raw characteristics][raw skills]' + NOTE,
    );
  });

  it('shows a failure note under the identity sub-heading only', async () => {
    failRenderAt(0);

    expect(await service.getImportedView(star)).toBe(
      '<h5>Identity</h5>' +
        NOTE +
        '<h5>Characteristics</h5>[db characteristics]' +
        '<h5>Starting skills</h5>[db skills]' +
        '<h5>Keywords</h5>[db keywords]',
    );
  });

  it('shows a failure note under the characteristics sub-heading only', async () => {
    failRenderAt(1);

    expect(await service.getImportedView(star)).toBe(
      '<h5>Identity</h5>[db identity]' +
        '<h5>Characteristics</h5>' +
        NOTE +
        '<h5>Starting skills</h5>[db skills]' +
        '<h5>Keywords</h5>[db keywords]',
    );
  });

  it('shows a failure note under the starting skills sub-heading only', async () => {
    failRenderAt(2);

    expect(await service.getImportedView(star)).toBe(
      '<h5>Identity</h5>[db identity]' +
        '<h5>Characteristics</h5>[db characteristics]' +
        '<h5>Starting skills</h5>' +
        NOTE +
        '<h5>Keywords</h5>[db keywords]',
    );
  });

  it('shows a failure note under the keywords sub-heading only', async () => {
    failRenderAt(3);

    expect(await service.getImportedView(star)).toBe(
      '<h5>Identity</h5>[db identity]' +
        '<h5>Characteristics</h5>[db characteristics]' +
        '<h5>Starting skills</h5>[db skills]' +
        '<h5>Keywords</h5>' +
        NOTE,
    );
  });
});
