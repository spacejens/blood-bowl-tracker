import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { SampledStarPlayer } from '../shared/review.types';
import { StarPlayerSkillsDbRendererService } from './star-player-skills-db-renderer.service';
import { StarPlayerSkillsRawRendererService } from './star-player-skills-raw-renderer.service';
import { StarPlayerSkillsReviewerService } from './star-player-skills-reviewer.service';

const star: SampledStarPlayer = {
  positionId: 5,
  positionName: 'Eldril Sidewinder',
  selectedFor: ['Random sample'],
};

describe('StarPlayerSkillsReviewerService', () => {
  let service: StarPlayerSkillsReviewerService;
  let raw: MockProxy<StarPlayerSkillsRawRendererService>;
  let imported: MockProxy<StarPlayerSkillsDbRendererService>;

  beforeEach(async () => {
    raw = mock<StarPlayerSkillsRawRendererService>();
    imported = mock<StarPlayerSkillsDbRendererService>();
    raw.render.mockResolvedValue('<table>raw</table>');
    imported.render.mockResolvedValue('<table>imported</table>');
    const moduleRef = await Test.createTestingModule({
      providers: [
        StarPlayerSkillsReviewerService,
        { provide: StarPlayerSkillsRawRendererService, useValue: raw },
        { provide: StarPlayerSkillsDbRendererService, useValue: imported },
      ],
    }).compile();
    service = moduleRef.get(StarPlayerSkillsReviewerService);
  });

  it('identifies itself as the star-player-skills data type', () => {
    expect(service.id).toBe('star-player-skills');
  });

  it('labels the raw panel', () => {
    expect(service.rawPanelLabel).toBe('Raw sources (BBL / TP)');
  });

  it('labels the imported panel', () => {
    expect(service.importedPanelLabel).toBe(
      'Imported starting skills (database)',
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
