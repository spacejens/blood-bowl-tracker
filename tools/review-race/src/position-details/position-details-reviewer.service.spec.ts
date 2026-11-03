import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { PositionCharacteristicsDbRendererService } from '../position-characteristics/position-characteristics-db-renderer.service';
import { PositionCharacteristicsRawRendererService } from '../position-characteristics/position-characteristics-raw-renderer.service';
import { PositionKeywordsDbRendererService } from '../position-keywords/position-keywords-db-renderer.service';
import { PositionKeywordsRawRendererService } from '../position-keywords/position-keywords-raw-renderer.service';
import { PositionStartingSkillsDbRendererService } from '../position-starting-skills/position-starting-skills-db-renderer.service';
import { PositionStartingSkillsRawRendererService } from '../position-starting-skills/position-starting-skills-raw-renderer.service';
import type { RaceDataTypeReviewer } from '../shared/data-type-reviewer';
import { RacePositionsQueryService } from '../shared/race-positions-query.service';
import type { SampledRace } from '../shared/review.types';
import { SectionRenderService } from '../shared/section-render.service';
import { PositionDetailsReviewerService } from './position-details-reviewer.service';

const race: SampledRace = {
  raceId: 7,
  raceName: 'Dwarf',
  selectedFor: ['Random sample'],
};

const NOTE = '<p class="note">Rendering failed: boom</p>';

const RAW_KEYWORDS_HEADING = '<h5>Keywords (TP codes and manual curation)</h5>';

describe('PositionDetailsReviewerService', () => {
  let service: PositionDetailsReviewerService;
  let rawCharacteristics: MockProxy<PositionCharacteristicsRawRendererService>;
  let dbCharacteristics: MockProxy<PositionCharacteristicsDbRendererService>;
  let rawSkills: MockProxy<PositionStartingSkillsRawRendererService>;
  let dbSkills: MockProxy<PositionStartingSkillsDbRendererService>;
  let rawKeywords: MockProxy<PositionKeywordsRawRendererService>;
  let dbKeywords: MockProxy<PositionKeywordsDbRendererService>;
  let query: MockProxy<RacePositionsQueryService>;
  let sections: MockProxy<SectionRenderService>;

  beforeEach(async () => {
    sections = mock<SectionRenderService>();
    sections.render.mockImplementation((section) => section());
    rawCharacteristics = mock<PositionCharacteristicsRawRendererService>();
    dbCharacteristics = mock<PositionCharacteristicsDbRendererService>();
    rawSkills = mock<PositionStartingSkillsRawRendererService>();
    dbSkills = mock<PositionStartingSkillsDbRendererService>();
    rawKeywords = mock<PositionKeywordsRawRendererService>();
    dbKeywords = mock<PositionKeywordsDbRendererService>();
    query = mock<RacePositionsQueryService>();
    rawCharacteristics.render.mockResolvedValue('[raw characteristics]');
    dbCharacteristics.render.mockResolvedValue('[db characteristics]');
    rawSkills.render.mockResolvedValue('[raw skills]');
    dbSkills.render.mockResolvedValue('[db skills]');
    rawKeywords.render.mockResolvedValue('[raw keywords]');
    dbKeywords.render.mockResolvedValue('[db keywords]');
    query.positionsFor.mockResolvedValue([
      {
        positionId: 1,
        positionName: 'Blocker',
        eraId: 10,
        eraName: 'Third Era',
      },
    ]);
    query.rulesSetsFor.mockResolvedValue([
      {
        rulesSetId: 100,
        rulesSetName: 'BB2025',
        moveFormat: 'bare',
        strengthFormat: 'bare',
        agilityFormat: 'plus',
        passingFormat: 'plus',
        armourFormat: 'plus',
      },
    ]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        PositionDetailsReviewerService,
        {
          provide: PositionCharacteristicsRawRendererService,
          useValue: rawCharacteristics,
        },
        {
          provide: PositionCharacteristicsDbRendererService,
          useValue: dbCharacteristics,
        },
        {
          provide: PositionStartingSkillsRawRendererService,
          useValue: rawSkills,
        },
        {
          provide: PositionStartingSkillsDbRendererService,
          useValue: dbSkills,
        },
        { provide: PositionKeywordsRawRendererService, useValue: rawKeywords },
        { provide: PositionKeywordsDbRendererService, useValue: dbKeywords },
        { provide: RacePositionsQueryService, useValue: query },
        // HtmlService is a pure formatter and is passed real.
        HtmlService,
        { provide: SectionRenderService, useValue: sections },
      ],
    }).compile();
    service = moduleRef.get(PositionDetailsReviewerService);
  });

  /** The part at this call position yields the note; the others forward. */
  const failRenderAt = (position: number): void => {
    for (let i = 0; i < position; i++) {
      sections.render.mockImplementationOnce((section) => section());
    }
    sections.render.mockResolvedValueOnce(NOTE);
  };

  it('identifies itself as the position-details panel pair', () => {
    const reviewer: RaceDataTypeReviewer = service;

    expect(reviewer.id).toBe('position-details');
    expect(reviewer.rawPanelLabel).toBe(
      'Raw sources (BBL / TP / manual curation)',
    );
    expect(reviewer.importedPanelLabel).toBe(
      'Imported position details (database)',
    );
  });

  it('stacks the raw characteristics, starting skills and keywords under subheadings', async () => {
    expect(await service.getRawSource(race)).toBe(
      '<h5>Position characteristics</h5>[raw characteristics]' +
        '<h5>Starting skills</h5>[raw skills]' +
        RAW_KEYWORDS_HEADING +
        '[raw keywords]',
    );
    expect(rawCharacteristics.render).toHaveBeenCalledWith(race);
    expect(rawSkills.render).toHaveBeenCalledWith(race);
    expect(rawKeywords.render).toHaveBeenCalledWith(race);
    expect(sections.render).toHaveBeenCalledTimes(3);
  });

  it('never runs the database guard for the raw panel', async () => {
    await service.getRawSource(race);

    expect(query.positionsFor).not.toHaveBeenCalled();
    expect(query.rulesSetsFor).not.toHaveBeenCalled();
  });

  it('stacks the stored characteristics, starting skills and keywords under subheadings', async () => {
    expect(await service.getImportedView(race)).toBe(
      '<h5>Position characteristics</h5>[db characteristics]' +
        '<h5>Starting skills</h5>[db skills]' +
        '<h5>Keywords</h5>[db keywords]',
    );
    expect(query.positionsFor).toHaveBeenCalledWith(7);
    expect(query.rulesSetsFor).toHaveBeenCalledWith(7);
    expect(dbCharacteristics.render).toHaveBeenCalledWith(race);
    expect(dbSkills.render).toHaveBeenCalledWith(race);
    expect(dbKeywords.render).toHaveBeenCalledWith(race);
    expect(sections.render).toHaveBeenCalledTimes(3);
  });

  it('shows one no-positions note for the whole imported panel', async () => {
    query.positionsFor.mockResolvedValue([]);

    expect(await service.getImportedView(race)).toBe(
      '<p class="note">No positions stored for race &quot;Dwarf&quot;, so no position details to show.</p>',
    );
    expect(query.rulesSetsFor).not.toHaveBeenCalled();
    expect(dbCharacteristics.render).not.toHaveBeenCalled();
    expect(dbSkills.render).not.toHaveBeenCalled();
    expect(dbKeywords.render).not.toHaveBeenCalled();
  });

  it('shows one no-rules-set note for the whole imported panel', async () => {
    query.rulesSetsFor.mockResolvedValue([]);

    expect(await service.getImportedView(race)).toBe(
      '<p class="note">Race &quot;Dwarf&quot; has no era mapped to a rules set.</p>',
    );
    expect(dbCharacteristics.render).not.toHaveBeenCalled();
    expect(dbSkills.render).not.toHaveBeenCalled();
    expect(dbKeywords.render).not.toHaveBeenCalled();
  });

  it('shows a failure note for a failing raw characteristics part only', async () => {
    failRenderAt(0);

    expect(await service.getRawSource(race)).toBe(
      '<h5>Position characteristics</h5>' +
        NOTE +
        '<h5>Starting skills</h5>[raw skills]' +
        RAW_KEYWORDS_HEADING +
        '[raw keywords]',
    );
  });

  it('shows a failure note for a failing raw starting-skills part only', async () => {
    failRenderAt(1);

    expect(await service.getRawSource(race)).toBe(
      '<h5>Position characteristics</h5>[raw characteristics]' +
        '<h5>Starting skills</h5>' +
        NOTE +
        RAW_KEYWORDS_HEADING +
        '[raw keywords]',
    );
  });

  it('shows a failure note for a failing raw keywords part only', async () => {
    failRenderAt(2);

    expect(await service.getRawSource(race)).toBe(
      '<h5>Position characteristics</h5>[raw characteristics]' +
        '<h5>Starting skills</h5>[raw skills]' +
        RAW_KEYWORDS_HEADING +
        NOTE,
    );
  });

  it('shows a failure note for a failing imported characteristics part only', async () => {
    failRenderAt(0);

    expect(await service.getImportedView(race)).toBe(
      '<h5>Position characteristics</h5>' +
        NOTE +
        '<h5>Starting skills</h5>[db skills]' +
        '<h5>Keywords</h5>[db keywords]',
    );
  });

  it('shows a failure note for a failing imported starting-skills part only', async () => {
    failRenderAt(1);

    expect(await service.getImportedView(race)).toBe(
      '<h5>Position characteristics</h5>[db characteristics]' +
        '<h5>Starting skills</h5>' +
        NOTE +
        '<h5>Keywords</h5>[db keywords]',
    );
  });

  it('shows a failure note for a failing imported keywords part only', async () => {
    failRenderAt(2);

    expect(await service.getImportedView(race)).toBe(
      '<h5>Position characteristics</h5>[db characteristics]' +
        '<h5>Starting skills</h5>[db skills]' +
        '<h5>Keywords</h5>' +
        NOTE,
    );
  });
});
