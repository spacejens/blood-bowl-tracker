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
    stubSections();
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

  /**
   * Every section yields a canned `[label]` result, except the one labelled
   * `failing`, which yields the failure note.
   */
  function stubSections(failing?: string): void {
    sections.render.mockImplementation((label) =>
      Promise.resolve(label === failing ? NOTE : `[${label}]`),
    );
  }

  /** What each section callback handed to `SectionRenderService` produces. */
  async function runSectionCallbacks(): Promise<string[]> {
    return Promise.all(sections.render.mock.calls.map(([, run]) => run()));
  }

  const ASPECTS = [
    'Identity',
    'Characteristics',
    'Starting skills',
    'Keywords',
  ];

  it('identifies itself as the star-player panel pair with its labels', () => {
    expect(service.id).toBe('star-player');
    expect(service.rawPanelLabel).toBe(
      'Raw sources (BBL / TP / manual curation)',
    );
    expect(service.importedPanelLabel).toBe('Imported (database)');
  });

  it('stacks the raw identity, characteristics, skills and keywords in order', async () => {
    expect(await service.getRawSource(star)).toBe(
      '[Identity][Characteristics][Starting skills][Keywords]',
    );
  });

  it('renders each raw section through its own raw renderer, labelled by aspect', async () => {
    await service.getRawSource(star);

    expect(sections.render.mock.calls.map(([label]) => label)).toEqual(ASPECTS);
    expect(await runSectionCallbacks()).toEqual([
      '[raw identity]',
      '[raw characteristics]',
      '[raw skills]',
      '[raw keywords]',
    ]);
    expect(rawIdentity.render).toHaveBeenCalledWith(star);
    expect(rawCharacteristics.render).toHaveBeenCalledWith(star);
    expect(rawSkills.render).toHaveBeenCalledWith(star);
    expect(rawKeywords.render).toHaveBeenCalledWith(star);
  });

  it('stacks the stored aspects under plain aspect sub-headings', async () => {
    expect(await service.getImportedView(star)).toBe(
      '<h5>Identity</h5>[Identity]' +
        '<h5>Characteristics</h5>[Characteristics]' +
        '<h5>Starting skills</h5>[Starting skills]' +
        '<h5>Keywords</h5>[Keywords]',
    );
  });

  it('renders each stored section through its own database renderer, labelled by aspect', async () => {
    await service.getImportedView(star);

    expect(sections.render.mock.calls.map(([label]) => label)).toEqual(ASPECTS);
    expect(await runSectionCallbacks()).toEqual([
      '[db identity]',
      '[db characteristics]',
      '[db skills]',
      '[db keywords]',
    ]);
    expect(dbIdentity.render).toHaveBeenCalledWith(star);
    expect(dbCharacteristics.render).toHaveBeenCalledWith(star);
    expect(dbSkills.render).toHaveBeenCalledWith(star);
    expect(dbKeywords.render).toHaveBeenCalledWith(star);
  });

  it.each(ASPECTS)(
    'shows the failure note in place of the failing raw %s section only',
    async (failing) => {
      stubSections(failing);

      const expected = ASPECTS.map((a) => (a === failing ? NOTE : `[${a}]`));
      expect(await service.getRawSource(star)).toBe(expected.join(''));
    },
  );

  it.each(ASPECTS)(
    'shows the failure note under the %s sub-heading only',
    async (failing) => {
      stubSections(failing);

      const expected = ASPECTS.map(
        (a) => `<h5>${a}</h5>${a === failing ? NOTE : `[${a}]`}`,
      );
      expect(await service.getImportedView(star)).toBe(expected.join(''));
    },
  );
});
