import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { SampledStarPlayer } from '../shared/review.types';
import { HireEligibilityDbRendererService } from './hire-eligibility-db-renderer.service';
import { HireEligibilityRawRendererService } from './hire-eligibility-raw-renderer.service';
import { HireEligibilityReviewerService } from './hire-eligibility-reviewer.service';

const star: SampledStarPlayer = {
  positionId: 5,
  positionName: 'Eldril Sidewinder',
  selectedFor: ['Random sample'],
};

describe('HireEligibilityReviewerService', () => {
  let service: HireEligibilityReviewerService;
  let raw: MockProxy<HireEligibilityRawRendererService>;
  let imported: MockProxy<HireEligibilityDbRendererService>;

  beforeEach(async () => {
    raw = mock<HireEligibilityRawRendererService>();
    imported = mock<HireEligibilityDbRendererService>();
    raw.render.mockResolvedValue('<table>raw</table>');
    imported.render.mockResolvedValue('<table>imported</table>');
    const moduleRef = await Test.createTestingModule({
      providers: [
        HireEligibilityReviewerService,
        { provide: HireEligibilityRawRendererService, useValue: raw },
        { provide: HireEligibilityDbRendererService, useValue: imported },
      ],
    }).compile();
    service = moduleRef.get(HireEligibilityReviewerService);
  });

  it('identifies itself as the star-player-hire-eligibility data type', () => {
    expect(service.id).toBe('star-player-hire-eligibility');
  });

  it('labels the raw panel', () => {
    expect(service.rawPanelLabel).toBe(
      'Raw sources (BBL / TP / manual curation)',
    );
  });

  it('labels the imported panel', () => {
    expect(service.importedPanelLabel).toBe(
      'Imported hire eligibility (database)',
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
