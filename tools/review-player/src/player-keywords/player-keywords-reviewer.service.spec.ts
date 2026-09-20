import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { SampledPlayer } from '../shared/review.types';
import { PlayerKeywordsDbRendererService } from './player-keywords-db-renderer.service';
import { PlayerKeywordsRawRendererService } from './player-keywords-raw-renderer.service';
import { PlayerKeywordsReviewerService } from './player-keywords-reviewer.service';

const player: SampledPlayer = {
  source: 'tp',
  playerId: 42,
  externalId: '2477481',
  playerName: 'Hubert Hårdråde',
  teamName: 'Reikland Reavers',
  positionName: 'Blitzer',
  eraName: 'Fourth Era',
  selectedFor: ['Random sample'],
};

describe('PlayerKeywordsReviewerService', () => {
  let service: PlayerKeywordsReviewerService;
  let raw: MockProxy<PlayerKeywordsRawRendererService>;
  let imported: MockProxy<PlayerKeywordsDbRendererService>;

  beforeEach(async () => {
    raw = mock<PlayerKeywordsRawRendererService>();
    imported = mock<PlayerKeywordsDbRendererService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayerKeywordsReviewerService,
        { provide: PlayerKeywordsRawRendererService, useValue: raw },
        { provide: PlayerKeywordsDbRendererService, useValue: imported },
      ],
    }).compile();
    service = moduleRef.get(PlayerKeywordsReviewerService);
  });

  it('identifies itself as the player-keywords data type', () => {
    expect(service.id).toBe('player-keywords');
  });

  it('labels the raw panel', () => {
    expect(service.rawPanelLabel).toBe(
      'Raw sources (TP template codes / manual curation)',
    );
  });

  it('labels the imported panel', () => {
    expect(service.importedPanelLabel).toBe(
      'Imported position keywords (database)',
    );
  });

  it('delegates the raw panel to the raw renderer with the sampled player', async () => {
    raw.render.mockResolvedValue('<table>raw</table>');

    expect(await service.getRawSource(player)).toBe('<table>raw</table>');
    expect(raw.render).toHaveBeenCalledWith(player);
  });

  it('delegates the imported panel to the db renderer with the sampled player', async () => {
    imported.render.mockResolvedValue('<table>imported</table>');

    expect(await service.getImportedView(player)).toBe(
      '<table>imported</table>',
    );
    expect(imported.render).toHaveBeenCalledWith(player);
  });
});
