import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { SampledPlayer } from '../shared/review.types';
import { BblPlayerAdvancementsRawRendererService } from './bbl-player-advancements-raw-renderer.service';
import { PlayerAdvancementsDbRendererService } from './player-advancements-db-renderer.service';
import { PlayerAdvancementsReviewerService } from './player-advancements-reviewer.service';
import { TpPlayerAdvancementsRawRendererService } from './tp-player-advancements-raw-renderer.service';

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

describe('PlayerAdvancementsReviewerService', () => {
  let service: PlayerAdvancementsReviewerService;
  let bblRaw: MockProxy<BblPlayerAdvancementsRawRendererService>;
  let tpRaw: MockProxy<TpPlayerAdvancementsRawRendererService>;
  let imported: MockProxy<PlayerAdvancementsDbRendererService>;

  beforeEach(async () => {
    bblRaw = mock<BblPlayerAdvancementsRawRendererService>();
    tpRaw = mock<TpPlayerAdvancementsRawRendererService>();
    imported = mock<PlayerAdvancementsDbRendererService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayerAdvancementsReviewerService,
        { provide: BblPlayerAdvancementsRawRendererService, useValue: bblRaw },
        { provide: TpPlayerAdvancementsRawRendererService, useValue: tpRaw },
        { provide: PlayerAdvancementsDbRendererService, useValue: imported },
      ],
    }).compile();
    service = moduleRef.get(PlayerAdvancementsReviewerService);
  });

  it('identifies itself as the player-advancements data type', () => {
    expect(service.id).toBe('player-advancements');
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
