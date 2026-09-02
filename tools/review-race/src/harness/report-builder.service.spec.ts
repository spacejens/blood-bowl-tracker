import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { SampledRace } from '../shared/review.types';
import { ReportBuilderService } from './report-builder.service';

const race: SampledRace = {
  raceId: 7,
  raceName: 'Dwarf',
  selectedFor: ['Random sample', 'override'],
};

const generatedAt = new Date('2026-08-26T09:00:00.000Z');

describe('ReportBuilderService', () => {
  let service: ReportBuilderService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ReportBuilderService, HtmlService],
    }).compile();
    service = moduleRef.get(ReportBuilderService);
  });

  it('titles the document for race review', () => {
    const html = service.build({ items: [], gaps: [], generatedAt });

    expect(html).toContain('<title>Race and position import review</title>');
    expect(html).toContain('<h1>Race and position import review</h1>');
  });

  it('uses the singular noun for one race and the plural for two', () => {
    const oneRace = service.build({
      items: [{ item: race, panels: [] }],
      gaps: [],
      generatedAt,
    });
    const twoRaces = service.build({
      items: [
        { item: race, panels: [] },
        { item: { ...race, raceId: 8, raceName: 'Human' }, panels: [] },
      ],
      gaps: [],
      generatedAt,
    });

    expect(oneRace).toContain('1 race.');
    expect(twoRaces).toContain('2 races.');
  });

  it("heads each race section with the race's name and database id", () => {
    const html = service.build({
      items: [{ item: race, panels: [] }],
      gaps: [],
      generatedAt,
    });

    expect(html).toContain('Dwarf (db id 7)');
  });

  it('lists the selectedFor reasons joined by ", "', () => {
    const html = service.build({
      items: [{ item: race, panels: [] }],
      gaps: [],
      generatedAt,
    });

    expect(html).toContain('Selected for: Random sample, override');
  });

  it("inserts each panel's rawHtml and importedHtml verbatim", () => {
    const html = service.build({
      items: [
        {
          item: race,
          panels: [
            {
              dataTypeId: 'race-identity',
              rawHtml: '<p>raw fragment</p>',
              importedHtml: '<p>imported fragment</p>',
            },
          ],
        },
      ],
      gaps: [],
      generatedAt,
    });

    expect(html).toContain('<p>raw fragment</p>');
    expect(html).toContain('<p>imported fragment</p>');
    expect(html).toContain('<h3>race-identity</h3>');
  });

  it('escapes a race name containing "<"', () => {
    const html = service.build({
      items: [{ item: { ...race, raceName: '<script>' }, panels: [] }],
      gaps: [],
      generatedAt,
    });

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
