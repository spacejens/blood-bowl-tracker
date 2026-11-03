import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { PositionAvailabilityDbRendererService } from '../position-availability/position-availability-db-renderer.service';
import { PositionAvailabilityRawRendererService } from '../position-availability/position-availability-raw-renderer.service';
import { RaceIdentityDbRendererService } from '../race-identity/race-identity-db-renderer.service';
import { RaceIdentityRawRendererService } from '../race-identity/race-identity-raw-renderer.service';
import type { RaceDataTypeReviewer } from '../shared/data-type-reviewer';
import type { SampledRace } from '../shared/review.types';
import { SectionRenderService } from '../shared/section-render.service';
import { RaceAndAvailabilityReviewerService } from './race-and-availability-reviewer.service';

const race: SampledRace = {
  raceId: 7,
  raceName: 'Dwarf',
  selectedFor: ['Random sample'],
};

const NOTE = '<p class="note">Rendering failed: boom</p>';

describe('RaceAndAvailabilityReviewerService', () => {
  let service: RaceAndAvailabilityReviewerService;
  let rawIdentity: MockProxy<RaceIdentityRawRendererService>;
  let dbIdentity: MockProxy<RaceIdentityDbRendererService>;
  let rawAvailability: MockProxy<PositionAvailabilityRawRendererService>;
  let dbAvailability: MockProxy<PositionAvailabilityDbRendererService>;
  let sections: MockProxy<SectionRenderService>;

  beforeEach(async () => {
    sections = mock<SectionRenderService>();
    sections.render.mockImplementation((section) => section());
    rawIdentity = mock<RaceIdentityRawRendererService>();
    dbIdentity = mock<RaceIdentityDbRendererService>();
    rawAvailability = mock<PositionAvailabilityRawRendererService>();
    dbAvailability = mock<PositionAvailabilityDbRendererService>();
    rawIdentity.render.mockResolvedValue('[raw identity]');
    dbIdentity.render.mockResolvedValue('[db identity]');
    rawAvailability.render.mockResolvedValue('[raw availability]');
    dbAvailability.render.mockResolvedValue('[db availability]');
    const moduleRef = await Test.createTestingModule({
      providers: [
        RaceAndAvailabilityReviewerService,
        { provide: RaceIdentityRawRendererService, useValue: rawIdentity },
        { provide: RaceIdentityDbRendererService, useValue: dbIdentity },
        {
          provide: PositionAvailabilityRawRendererService,
          useValue: rawAvailability,
        },
        {
          provide: PositionAvailabilityDbRendererService,
          useValue: dbAvailability,
        },
        // HtmlService is a pure formatter and is passed real.
        HtmlService,
        { provide: SectionRenderService, useValue: sections },
      ],
    }).compile();
    service = moduleRef.get(RaceAndAvailabilityReviewerService);
  });

  /** The part at this call position yields the note; the others forward. */
  const failRenderAt = (position: number): void => {
    for (let i = 0; i < position; i++) {
      sections.render.mockImplementationOnce((section) => section());
    }
    sections.render.mockResolvedValueOnce(NOTE);
  };

  it('identifies itself as the race-and-availability panel pair', () => {
    const reviewer: RaceDataTypeReviewer = service;

    expect(reviewer.id).toBe('race-and-availability');
    expect(reviewer.rawPanelLabel).toBe(
      'Raw sources (BBL / TP / manual curation)',
    );
    expect(reviewer.importedPanelLabel).toBe(
      'Imported race and availability (database)',
    );
  });

  it('stacks the raw race identity and position availability under subheadings', async () => {
    expect(await service.getRawSource(race)).toBe(
      '<h5>Race identity</h5>[raw identity]' +
        '<h5>Position availability</h5>[raw availability]',
    );
    expect(rawIdentity.render).toHaveBeenCalledWith(race);
    expect(rawAvailability.render).toHaveBeenCalledWith(race);
    expect(sections.render).toHaveBeenCalledTimes(2);
  });

  it('stacks the stored race identity and position availability under subheadings', async () => {
    expect(await service.getImportedView(race)).toBe(
      '<h5>Race identity</h5>[db identity]' +
        '<h5>Position availability</h5>[db availability]',
    );
    expect(dbIdentity.render).toHaveBeenCalledWith(race);
    expect(dbAvailability.render).toHaveBeenCalledWith(race);
    expect(sections.render).toHaveBeenCalledTimes(2);
  });

  it('shows a failure note for a failing raw identity part only', async () => {
    failRenderAt(0);

    expect(await service.getRawSource(race)).toBe(
      '<h5>Race identity</h5>' +
        NOTE +
        '<h5>Position availability</h5>[raw availability]',
    );
  });

  it('shows a failure note for a failing raw availability part only', async () => {
    failRenderAt(1);

    expect(await service.getRawSource(race)).toBe(
      '<h5>Race identity</h5>[raw identity]' +
        '<h5>Position availability</h5>' +
        NOTE,
    );
  });

  it('shows a failure note for a failing imported identity part only', async () => {
    failRenderAt(0);

    expect(await service.getImportedView(race)).toBe(
      '<h5>Race identity</h5>' +
        NOTE +
        '<h5>Position availability</h5>[db availability]',
    );
  });

  it('shows a failure note for a failing imported availability part only', async () => {
    failRenderAt(1);

    expect(await service.getImportedView(race)).toBe(
      '<h5>Race identity</h5>[db identity]' +
        '<h5>Position availability</h5>' +
        NOTE,
    );
  });
});
