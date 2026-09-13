import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { SampledStarPlayer } from '../shared/review.types';
import { StarPlayerIdentityDbRendererService } from './identity-db-renderer.service';
import { StarPlayerIdentityRawRendererService } from './identity-raw-renderer.service';
import { StarPlayerIdentityReviewerService } from './identity-reviewer.service';

const star: SampledStarPlayer = {
  positionId: 5,
  positionName: 'Eldril Sidewinder',
  selectedFor: ['Random sample'],
};

describe('StarPlayerIdentityReviewerService', () => {
  let service: StarPlayerIdentityReviewerService;
  let raw: MockProxy<StarPlayerIdentityRawRendererService>;
  let imported: MockProxy<StarPlayerIdentityDbRendererService>;

  beforeEach(async () => {
    raw = mock<StarPlayerIdentityRawRendererService>();
    imported = mock<StarPlayerIdentityDbRendererService>();
    raw.render.mockResolvedValue('<table>raw</table>');
    imported.render.mockResolvedValue('<table>imported</table>');
    const moduleRef = await Test.createTestingModule({
      providers: [
        StarPlayerIdentityReviewerService,
        { provide: StarPlayerIdentityRawRendererService, useValue: raw },
        { provide: StarPlayerIdentityDbRendererService, useValue: imported },
      ],
    }).compile();
    service = moduleRef.get(StarPlayerIdentityReviewerService);
  });

  it('identifies itself as the star-player-identity data type', () => {
    expect(service.id).toBe('star-player-identity');
  });

  it('labels the raw panel', () => {
    expect(service.rawPanelLabel).toBe(
      'Raw sources (BBL / TP / manual curation)',
    );
  });

  it('labels the imported panel', () => {
    expect(service.importedPanelLabel).toBe('Imported (database)');
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
