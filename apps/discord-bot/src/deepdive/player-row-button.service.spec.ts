import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX,
} from './button-custom-ids';
import { PlayerRowButtonService } from './player-row-button.service';

describe('PlayerRowButtonService', () => {
  let service: PlayerRowButtonService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PlayerRowButtonService],
    }).compile();
    service = moduleRef.get(PlayerRowButtonService);
  });

  it('routes a regular roster player to the per-team player deepdive', () => {
    expect(
      service.buildPlayerRowButton({
        playerId: 88,
        playerName: 'Griff Oberwald',
        positionId: 60,
        positionName: 'Blitzer',
        isStarPlayer: false,
      }),
    ).toEqual({
      customIdPrefix: PLAYER_BUTTON_CUSTOM_ID_PREFIX,
      entityId: '88',
      label: 'Griff Oberwald',
    });
  });

  it('routes a star hire to the star player deepdive, keyed by position', () => {
    expect(
      service.buildPlayerRowButton({
        playerId: 99,
        playerName: 'Morg N Thorg',
        positionId: 61,
        positionName: 'Morg N Thorg',
        isStarPlayer: true,
      }),
    ).toEqual({
      customIdPrefix: STAR_PLAYER_BUTTON_CUSTOM_ID_PREFIX,
      entityId: '61',
      label: 'Morg N Thorg',
    });
  });

  it('labels a star hire with the star name, not the hire row name', () => {
    // A hire's `players.name` can differ from the star's canonical position
    // name; the star deepdive is about the star, so the star name wins.
    expect(
      service.buildPlayerRowButton({
        playerId: 99,
        playerName: 'Morg (hired)',
        positionId: 61,
        positionName: 'Morg N Thorg',
        isStarPlayer: true,
      }).label,
    ).toBe('Morg N Thorg');
  });
});
