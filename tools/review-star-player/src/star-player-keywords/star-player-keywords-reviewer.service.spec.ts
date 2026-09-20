import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { SampledStarPlayer } from '../shared/review.types';
import { StarPlayerKeywordsDbRendererService } from './star-player-keywords-db-renderer.service';
import { StarPlayerKeywordsRawRendererService } from './star-player-keywords-raw-renderer.service';
import { StarPlayerKeywordsReviewerService } from './star-player-keywords-reviewer.service';

const star: SampledStarPlayer = {
  positionId: 5,
  positionName: 'Eldril Sidewinder',
  selectedFor: ['Random sample'],
};

describe('StarPlayerKeywordsReviewerService', () => {
  let service: StarPlayerKeywordsReviewerService;
  let raw: MockProxy<StarPlayerKeywordsRawRendererService>;
  let imported: MockProxy<StarPlayerKeywordsDbRendererService>;

  beforeEach(async () => {
    raw = mock<StarPlayerKeywordsRawRendererService>();
    imported = mock<StarPlayerKeywordsDbRendererService>();
    raw.render.mockResolvedValue('<table>raw</table>');
    imported.render.mockResolvedValue('<table>imported</table>');
    const moduleRef = await Test.createTestingModule({
      providers: [
        StarPlayerKeywordsReviewerService,
        { provide: StarPlayerKeywordsRawRendererService, useValue: raw },
        { provide: StarPlayerKeywordsDbRendererService, useValue: imported },
      ],
    }).compile();
    service = moduleRef.get(StarPlayerKeywordsReviewerService);
  });

  it('identifies itself as the star-player-keywords data type', () => {
    expect(service.id).toBe('star-player-keywords');
  });

  it('labels the raw panel', () => {
    expect(service.rawPanelLabel).toBe(
      'Raw sources (TP codes / manual curation)',
    );
  });

  it('labels the imported panel', () => {
    expect(service.importedPanelLabel).toBe('Imported keywords (database)');
  });

  it('delegates the raw panel to the raw renderer with the sampled star', async () => {
    expect(await service.getRawSource(star)).toBe('<table>raw</table>');
    expect(raw.render).toHaveBeenCalledWith(star);
  });

  it('delegates the imported panel to the db renderer with the sampled star', async () => {
    expect(await service.getImportedView(star)).toBe('<table>imported</table>');
    expect(imported.render).toHaveBeenCalledWith(star);
  });
});
