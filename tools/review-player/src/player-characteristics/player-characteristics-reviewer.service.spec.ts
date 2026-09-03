import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { SampledPlayer } from '../shared/review.types';
import { BblPlayerCharacteristicsRawRendererService } from './bbl-player-characteristics-raw-renderer.service';
import { PlayerCharacteristicsDbRendererService } from './player-characteristics-db-renderer.service';
import { PlayerCharacteristicsReviewerService } from './player-characteristics-reviewer.service';
import { TpPlayerCharacteristicsRawRendererService } from './tp-player-characteristics-raw-renderer.service';

const player: SampledPlayer = {
  source: 'bbl',
  playerId: 42,
  externalId: '1000',
  playerName: 'Grim Ironjaw',
  teamName: 'Reikland Reavers',
  positionName: 'Blitzer',
  eraName: 'Fourth Era',
  selectedFor: ['Random sample'],
};

describe('PlayerCharacteristicsReviewerService', () => {
  let service: PlayerCharacteristicsReviewerService;
  let bblRaw: MockProxy<BblPlayerCharacteristicsRawRendererService>;
  let tpRaw: MockProxy<TpPlayerCharacteristicsRawRendererService>;
  let imported: MockProxy<PlayerCharacteristicsDbRendererService>;

  beforeEach(async () => {
    bblRaw = mock<BblPlayerCharacteristicsRawRendererService>();
    tpRaw = mock<TpPlayerCharacteristicsRawRendererService>();
    imported = mock<PlayerCharacteristicsDbRendererService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayerCharacteristicsReviewerService,
        {
          provide: BblPlayerCharacteristicsRawRendererService,
          useValue: bblRaw,
        },
        { provide: TpPlayerCharacteristicsRawRendererService, useValue: tpRaw },
        { provide: PlayerCharacteristicsDbRendererService, useValue: imported },
      ],
    }).compile();
    service = moduleRef.get(PlayerCharacteristicsReviewerService);
  });

  it('identifies itself as the player-characteristics data type', () => {
    expect(service.id).toBe('player-characteristics');
  });

  it('renders the BBL raw panel for a BBL-sampled player', async () => {
    bblRaw.render.mockResolvedValue('<p>bbl</p>');

    expect(await service.getRawSource(player)).toBe('<p>bbl</p>');
    expect(bblRaw.render).toHaveBeenCalledWith('1000');
    expect(tpRaw.render).not.toHaveBeenCalled();
  });

  it('renders the TP raw panel for a TP-sampled player', async () => {
    tpRaw.render.mockResolvedValue('<p>tp</p>');

    expect(await service.getRawSource({ ...player, source: 'tp' })).toBe(
      '<p>tp</p>',
    );
    expect(tpRaw.render).toHaveBeenCalledWith('1000');
    expect(bblRaw.render).not.toHaveBeenCalled();
  });

  it('renders the imported panel from the database renderer', async () => {
    imported.render.mockResolvedValue('<p>db</p>');

    expect(await service.getImportedView(player)).toBe('<p>db</p>');
    expect(imported.render).toHaveBeenCalledWith(player);
  });
});
