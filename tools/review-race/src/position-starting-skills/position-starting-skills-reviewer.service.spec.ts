import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { SampledRace } from '../shared/review.types';
import { PositionStartingSkillsDbRendererService } from './position-starting-skills-db-renderer.service';
import { PositionStartingSkillsRawRendererService } from './position-starting-skills-raw-renderer.service';
import { PositionStartingSkillsReviewerService } from './position-starting-skills-reviewer.service';

const race: SampledRace = {
  raceId: 7,
  raceName: 'Dwarf',
  selectedFor: ['Random sample'],
};

describe('PositionStartingSkillsReviewerService', () => {
  let service: PositionStartingSkillsReviewerService;
  let raw: MockProxy<PositionStartingSkillsRawRendererService>;
  let imported: MockProxy<PositionStartingSkillsDbRendererService>;

  beforeEach(async () => {
    raw = mock<PositionStartingSkillsRawRendererService>();
    imported = mock<PositionStartingSkillsDbRendererService>();
    raw.render.mockResolvedValue('<table>raw</table>');
    imported.render.mockResolvedValue('<table>imported</table>');
    const moduleRef = await Test.createTestingModule({
      providers: [
        PositionStartingSkillsReviewerService,
        { provide: PositionStartingSkillsRawRendererService, useValue: raw },
        {
          provide: PositionStartingSkillsDbRendererService,
          useValue: imported,
        },
      ],
    }).compile();
    service = moduleRef.get(PositionStartingSkillsReviewerService);
  });

  it('identifies itself as the position-starting-skills data type', () => {
    expect(service.id).toBe('position-starting-skills');
  });

  it('labels the raw panel', () => {
    expect(service.rawPanelLabel).toBe(
      'Raw sources (BBL / TP / manual curation)',
    );
  });

  it('labels the imported panel', () => {
    expect(service.importedPanelLabel).toBe(
      'Imported starting skills (database)',
    );
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
