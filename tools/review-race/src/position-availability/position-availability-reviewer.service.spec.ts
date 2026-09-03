import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { SampledRace } from '../shared/review.types';
import { PositionAvailabilityDbRendererService } from './position-availability-db-renderer.service';
import { PositionAvailabilityRawRendererService } from './position-availability-raw-renderer.service';
import { PositionAvailabilityReviewerService } from './position-availability-reviewer.service';

const race: SampledRace = {
  raceId: 7,
  raceName: 'Dwarf',
  selectedFor: ['Random sample'],
};

describe('PositionAvailabilityReviewerService', () => {
  let service: PositionAvailabilityReviewerService;
  let raw: MockProxy<PositionAvailabilityRawRendererService>;
  let imported: MockProxy<PositionAvailabilityDbRendererService>;

  beforeEach(async () => {
    raw = mock<PositionAvailabilityRawRendererService>();
    imported = mock<PositionAvailabilityDbRendererService>();
    raw.render.mockResolvedValue('<table>raw</table>');
    imported.render.mockResolvedValue('<table>imported</table>');
    const moduleRef = await Test.createTestingModule({
      providers: [
        PositionAvailabilityReviewerService,
        { provide: PositionAvailabilityRawRendererService, useValue: raw },
        { provide: PositionAvailabilityDbRendererService, useValue: imported },
      ],
    }).compile();
    service = moduleRef.get(PositionAvailabilityReviewerService);
  });

  it('identifies itself as the position-availability data type', () => {
    expect(service.id).toBe('position-availability');
  });

  it('labels the raw panel', () => {
    expect(service.rawPanelLabel).toBe(
      'Raw sources (BBL / TP / manual curation)',
    );
  });

  it('labels the imported panel', () => {
    expect(service.importedPanelLabel).toBe('Imported availability (database)');
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
