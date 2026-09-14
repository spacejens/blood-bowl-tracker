import { HtmlService } from '@blood-bowl-tracker/review-harness';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { StarPlayerExternalIdsService } from '../shared/star-player-external-ids.service';
import { StarPlayerIdentityDbRendererService } from './identity-db-renderer.service';

const STAR = {
  positionId: 5,
  positionName: 'Eldril Sidewinder',
  selectedFor: ['Random sample'],
};

async function makeService(
  externalIds: MockProxy<StarPlayerExternalIdsService>,
): Promise<StarPlayerIdentityDbRendererService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      StarPlayerIdentityDbRendererService,
      { provide: StarPlayerExternalIdsService, useValue: externalIds },
      HtmlService,
    ],
  }).compile();
  return moduleRef.get(StarPlayerIdentityDbRendererService);
}

describe('StarPlayerIdentityDbRendererService', () => {
  it('renders the stored row, the star flag and every external id', async () => {
    const externalIds = mock<StarPlayerExternalIdsService>();
    externalIds.allForPosition.mockResolvedValue([
      { systemName: 'Name', externalId: 'Eldril Sidewinder' },
    ]);
    const service = await makeService(externalIds);

    const html = await service.render(STAR);

    expect(html).toContain('Eldril Sidewinder');
    expect(html).toContain('5');
    expect(html).toContain('is_star_player');
    expect(html).toContain('External id (Name)');
  });

  it('says explicitly that cost is not stored', async () => {
    const externalIds = mock<StarPlayerExternalIdsService>();
    externalIds.allForPosition.mockResolvedValue([]);
    const service = await makeService(externalIds);

    const html = await service.render(STAR);

    expect(html).toContain('not stored');
  });

  it('shows a star with no external ids as having none', async () => {
    const externalIds = mock<StarPlayerExternalIdsService>();
    externalIds.allForPosition.mockResolvedValue([]);
    const service = await makeService(externalIds);

    expect(await service.render(STAR)).toContain('none');
  });
});
