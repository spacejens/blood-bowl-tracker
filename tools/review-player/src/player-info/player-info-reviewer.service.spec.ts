import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import type { SampledPlayer } from '../shared/review.types';
import { BblPlayerInfoRawRendererService } from './bbl-player-info-raw-renderer.service';
import { PlayerInfoDbRendererService } from './player-info-db-renderer.service';
import { PlayerInfoReviewerService } from './player-info-reviewer.service';
import { TpPlayerInfoRawRendererService } from './tp-player-info-raw-renderer.service';

const player: SampledPlayer = {
  source: 'bbl',
  playerId: 42,
  externalId: '1000',
  playerName: 'Janhorgh',
  teamName: 'Bockar',
  positionName: 'Lineman',
  eraName: 'Third Era',
  selectedFor: ['Random sample'],
};

describe('PlayerInfoReviewerService', () => {
  let service: PlayerInfoReviewerService;
  let bbl: MockProxy<BblPlayerInfoRawRendererService>;
  let tp: MockProxy<TpPlayerInfoRawRendererService>;
  let db: MockProxy<PlayerInfoDbRendererService>;

  beforeEach(async () => {
    bbl = mock<BblPlayerInfoRawRendererService>();
    tp = mock<TpPlayerInfoRawRendererService>();
    db = mock<PlayerInfoDbRendererService>();
    bbl.render.mockResolvedValue('<table>bbl</table>');
    tp.render.mockResolvedValue('<table>tp</table>');
    db.render.mockResolvedValue('<table>db</table>');
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayerInfoReviewerService,
        { provide: BblPlayerInfoRawRendererService, useValue: bbl },
        { provide: TpPlayerInfoRawRendererService, useValue: tp },
        { provide: PlayerInfoDbRendererService, useValue: db },
      ],
    }).compile();
    service = moduleRef.get(PlayerInfoReviewerService);
  });

  it('identifies itself as the player-info data type', () => {
    expect(service.id).toBe('player-info');
  });

  it('renders the BBL page for a BBL-sampled player', async () => {
    expect(await service.getRawSource(player)).toBe('<table>bbl</table>');
    expect(bbl.render).toHaveBeenCalledWith('1000');
    expect(tp.render).not.toHaveBeenCalled();
  });

  it('renders the TP aggregate for a TP-sampled player', async () => {
    expect(
      await service.getRawSource({
        ...player,
        source: 'tp',
        externalId: '2477481',
      }),
    ).toBe('<table>tp</table>');
    expect(tp.render).toHaveBeenCalledWith('2477481');
  });

  it('renders the database view for the imported panel', async () => {
    expect(await service.getImportedView(player)).toBe('<table>db</table>');
    expect(db.render).toHaveBeenCalledWith(player);
  });
});
