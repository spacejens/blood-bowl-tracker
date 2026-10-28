import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { SampledPlayer } from '../shared/review.types';
import { BblPlayerStatusRawRendererService } from './bbl-player-status-raw-renderer.service';
import { PlayerStatusDbRendererService } from './player-status-db-renderer.service';
import { PlayerStatusReviewerService } from './player-status-reviewer.service';
import { TpPlayerStatusRawRendererService } from './tp-player-status-raw-renderer.service';

function player(source: 'bbl' | 'tp'): SampledPlayer {
  return {
    source,
    playerId: 42,
    externalId: '1000',
    playerName: 'Grim Ironjaw',
    teamName: 'Reikland Reavers',
    positionName: 'Blitzer',
    eraName: 'Fourth Era',
    selectedFor: ['Dead player'],
  };
}

describe('PlayerStatusReviewerService', () => {
  let service: PlayerStatusReviewerService;
  let bblRaw: MockProxy<BblPlayerStatusRawRendererService>;
  let tpRaw: MockProxy<TpPlayerStatusRawRendererService>;
  let imported: MockProxy<PlayerStatusDbRendererService>;

  beforeEach(async () => {
    bblRaw = mock<BblPlayerStatusRawRendererService>();
    tpRaw = mock<TpPlayerStatusRawRendererService>();
    imported = mock<PlayerStatusDbRendererService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayerStatusReviewerService,
        { provide: BblPlayerStatusRawRendererService, useValue: bblRaw },
        { provide: TpPlayerStatusRawRendererService, useValue: tpRaw },
        { provide: PlayerStatusDbRendererService, useValue: imported },
      ],
    }).compile();
    service = moduleRef.get(PlayerStatusReviewerService);
  });

  it('identifies itself as the player-status data type', () => {
    expect(service.id).toBe('player-status');
  });

  it('renders the BBL raw panel for a BBL-sampled player', async () => {
    bblRaw.render.mockResolvedValue('<table>bbl</table>');

    expect(await service.getRawSource(player('bbl'))).toBe(
      '<table>bbl</table>',
    );
    expect(bblRaw.render).toHaveBeenCalledWith('1000');
    expect(tpRaw.render).not.toHaveBeenCalled();
  });

  it('renders the TP raw panel for a TP-sampled player', async () => {
    tpRaw.render.mockResolvedValue('<table>tp</table>');

    expect(await service.getRawSource(player('tp'))).toBe('<table>tp</table>');
    expect(tpRaw.render).toHaveBeenCalledWith('1000');
    expect(bblRaw.render).not.toHaveBeenCalled();
  });

  it('delegates the imported panel to the db renderer', async () => {
    imported.render.mockResolvedValue('<table>db</table>');
    const sampled = player('bbl');

    expect(await service.getImportedView(sampled)).toBe('<table>db</table>');
    expect(imported.render).toHaveBeenCalledWith(sampled);
  });
});
