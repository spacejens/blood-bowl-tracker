import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { SampledRace } from '../shared/review.types';
import { PositionCharacteristicsDbRendererService } from './position-characteristics-db-renderer.service';
import { PositionCharacteristicsRawRendererService } from './position-characteristics-raw-renderer.service';
import { PositionCharacteristicsReviewerService } from './position-characteristics-reviewer.service';

const race: SampledRace = {
  raceId: 7,
  raceName: 'Dwarf',
  selectedFor: ['Random sample'],
};

describe('PositionCharacteristicsReviewerService', () => {
  let service: PositionCharacteristicsReviewerService;
  let raw: MockProxy<PositionCharacteristicsRawRendererService>;
  let imported: MockProxy<PositionCharacteristicsDbRendererService>;

  beforeEach(async () => {
    raw = mock<PositionCharacteristicsRawRendererService>();
    imported = mock<PositionCharacteristicsDbRendererService>();
    raw.render.mockResolvedValue('<table>raw</table>');
    imported.render.mockResolvedValue('<table>imported</table>');
    const moduleRef = await Test.createTestingModule({
      providers: [
        PositionCharacteristicsReviewerService,
        { provide: PositionCharacteristicsRawRendererService, useValue: raw },
        {
          provide: PositionCharacteristicsDbRendererService,
          useValue: imported,
        },
      ],
    }).compile();
    service = moduleRef.get(PositionCharacteristicsReviewerService);
  });

  it('identifies itself as the position-characteristics data type', () => {
    expect(service.id).toBe('position-characteristics');
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

  it('delegates the raw panel to the raw renderer with the sampled race', async () => {
    expect(await service.getRawSource(race)).toBe('<table>raw</table>');
    expect(raw.render).toHaveBeenCalledWith(race);
  });

  it('delegates the imported panel to the db renderer with the sampled race', async () => {
    expect(await service.getImportedView(race)).toBe('<table>imported</table>');
    expect(imported.render).toHaveBeenCalledWith(race);
  });
});
