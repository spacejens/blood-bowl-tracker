import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { SampledStarPlayer } from '../shared/review.types';
import { StarPlayerCharacteristicsDbRendererService } from './characteristics-db-renderer.service';
import { StarPlayerCharacteristicsRawRendererService } from './characteristics-raw-renderer.service';
import { StarPlayerCharacteristicsReviewerService } from './characteristics-reviewer.service';

const star: SampledStarPlayer = {
  positionId: 5,
  positionName: 'Eldril Sidewinder',
  selectedFor: ['Random sample'],
};

describe('StarPlayerCharacteristicsReviewerService', () => {
  let service: StarPlayerCharacteristicsReviewerService;
  let raw: MockProxy<StarPlayerCharacteristicsRawRendererService>;
  let imported: MockProxy<StarPlayerCharacteristicsDbRendererService>;

  beforeEach(async () => {
    raw = mock<StarPlayerCharacteristicsRawRendererService>();
    imported = mock<StarPlayerCharacteristicsDbRendererService>();
    raw.render.mockResolvedValue('<table>raw</table>');
    imported.render.mockResolvedValue('<table>imported</table>');
    const moduleRef = await Test.createTestingModule({
      providers: [
        StarPlayerCharacteristicsReviewerService,
        { provide: StarPlayerCharacteristicsRawRendererService, useValue: raw },
        {
          provide: StarPlayerCharacteristicsDbRendererService,
          useValue: imported,
        },
      ],
    }).compile();
    service = moduleRef.get(StarPlayerCharacteristicsReviewerService);
  });

  it('identifies itself as the star-player-characteristics data type', () => {
    expect(service.id).toBe('star-player-characteristics');
  });

  it('labels the raw panel', () => {
    expect(service.rawPanelLabel).toBe(
      'Raw sources (BBL / TP / manual curation)',
    );
  });

  it('labels the imported panel', () => {
    expect(service.importedPanelLabel).toBe(
      'Imported characteristics (database)',
    );
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
