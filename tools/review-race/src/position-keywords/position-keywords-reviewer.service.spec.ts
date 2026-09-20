import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { SampledRace } from '../shared/review.types';
import { PositionKeywordsDbRendererService } from './position-keywords-db-renderer.service';
import { PositionKeywordsRawRendererService } from './position-keywords-raw-renderer.service';
import { PositionKeywordsReviewerService } from './position-keywords-reviewer.service';

const race: SampledRace = {
  raceId: 7,
  raceName: 'Dwarf',
  selectedFor: ['Random sample'],
};

describe('PositionKeywordsReviewerService', () => {
  let service: PositionKeywordsReviewerService;
  let raw: MockProxy<PositionKeywordsRawRendererService>;
  let imported: MockProxy<PositionKeywordsDbRendererService>;

  beforeEach(async () => {
    raw = mock<PositionKeywordsRawRendererService>();
    imported = mock<PositionKeywordsDbRendererService>();
    raw.render.mockResolvedValue('<table>raw</table>');
    imported.render.mockResolvedValue('<table>imported</table>');
    const moduleRef = await Test.createTestingModule({
      providers: [
        PositionKeywordsReviewerService,
        { provide: PositionKeywordsRawRendererService, useValue: raw },
        { provide: PositionKeywordsDbRendererService, useValue: imported },
      ],
    }).compile();
    service = moduleRef.get(PositionKeywordsReviewerService);
  });

  it('identifies itself as the position-keywords data type', () => {
    expect(service.id).toBe('position-keywords');
  });

  it('labels the raw panel', () => {
    expect(service.rawPanelLabel).toBe(
      'Raw sources (TP codes / manual curation)',
    );
  });

  it('labels the imported panel', () => {
    expect(service.importedPanelLabel).toBe('Imported keywords (database)');
  });

  it('delegates the raw panel to the raw renderer with the sampled race', async () => {
    expect(await service.getRawSource(race)).toBe('<table>raw</table>');
    expect(raw.render).toHaveBeenCalledWith(race);
  });

  it('delegates the imported panel to the db renderer with the sampled race', async () => {
    expect(await service.getImportedView(race)).toBe('<table>imported</table>');
    expect(imported.render).toHaveBeenCalledWith(race);
  });
});
