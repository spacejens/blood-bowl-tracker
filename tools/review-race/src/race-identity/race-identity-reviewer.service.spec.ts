import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { SampledRace } from '../shared/review.types';
import { RaceIdentityDbRendererService } from './race-identity-db-renderer.service';
import { RaceIdentityRawRendererService } from './race-identity-raw-renderer.service';
import { RaceIdentityReviewerService } from './race-identity-reviewer.service';

const race: SampledRace = {
  raceId: 7,
  raceName: 'Dwarf',
  selectedFor: ['Random sample'],
};

describe('RaceIdentityReviewerService', () => {
  let service: RaceIdentityReviewerService;
  let raw: MockProxy<RaceIdentityRawRendererService>;
  let imported: MockProxy<RaceIdentityDbRendererService>;

  beforeEach(async () => {
    raw = mock<RaceIdentityRawRendererService>();
    imported = mock<RaceIdentityDbRendererService>();
    raw.render.mockResolvedValue('<table>raw</table>');
    imported.render.mockResolvedValue('<table>imported</table>');
    const moduleRef = await Test.createTestingModule({
      providers: [
        RaceIdentityReviewerService,
        { provide: RaceIdentityRawRendererService, useValue: raw },
        { provide: RaceIdentityDbRendererService, useValue: imported },
      ],
    }).compile();
    service = moduleRef.get(RaceIdentityReviewerService);
  });

  it('identifies itself as the race-identity data type', () => {
    expect(service.id).toBe('race-identity');
  });

  it('labels the raw panel', () => {
    expect(service.rawPanelLabel).toBe(
      'Raw sources (BBL / TP / manual curation)',
    );
  });

  it('labels the imported panel', () => {
    expect(service.importedPanelLabel).toBe('Imported (database)');
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
