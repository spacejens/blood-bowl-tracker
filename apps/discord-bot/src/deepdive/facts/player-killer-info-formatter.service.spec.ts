import type { PlayerKillerInfo } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import {
  PLAYER_BUTTON_CUSTOM_ID_PREFIX,
  TEAM_BUTTON_CUSTOM_ID_PREFIX,
} from '../button-custom-ids';
import { PlayerRowButtonService } from '../player-row-button.service';
import { PlayerKillerInfoFormatterService } from './player-killer-info-formatter.service';

const gougedEye = {
  teamId: 12,
  teamName: 'Gouged Eye',
  raceId: 5,
  raceName: 'Orc',
  coachId: 22,
  coachName: 'Grimly',
};
const championsOfDeath = {
  teamId: 13,
  teamName: 'Champions of Death',
  raceId: 6,
  raceName: 'Undead',
  coachId: 23,
  coachName: 'Mortis',
};
const chaosAllStars = {
  teamId: 14,
  teamName: 'Chaos All-Stars',
  raceId: 7,
  raceName: 'Chaos',
  coachId: 24,
  coachName: 'Nurgle',
};

const namedPlayer: PlayerKillerInfo = {
  kind: 'player',
  playerId: 88,
  playerName: 'Griff Oberwald',
  positionId: 60,
  positionName: 'Blitzer',
  isStarPlayer: false,
  ...gougedEye,
  viaFoul: false,
};

describe('PlayerKillerInfoFormatterService', () => {
  let service: PlayerKillerInfoFormatterService;
  let playerRowButton: MockProxy<PlayerRowButtonService>;

  beforeEach(async () => {
    playerRowButton = mock<PlayerRowButtonService>();
    playerRowButton.buildPlayerRowButton.mockReturnValue({
      customIdPrefix: PLAYER_BUTTON_CUSTOM_ID_PREFIX,
      entityId: '88',
      label: 'Griff Oberwald',
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayerKillerInfoFormatterService,
        { provide: PlayerRowButtonService, useValue: playerRowButton },
      ],
    }).compile();
    service = moduleRef.get(PlayerKillerInfoFormatterService);
  });

  it('formats a team with its race and coach context', () => {
    expect(service.formatTeam(gougedEye)).toBe('Gouged Eye (Orc, Grimly)');
  });

  it('joins two parts with "or"', () => {
    expect(service.joinWithOr(['X', 'Y'])).toBe('X or Y');
  });

  it('uses an Oxford comma for three or more parts', () => {
    expect(service.joinWithOr(['X', 'Y', 'Z'])).toBe('X, Y, or Z');
  });

  it('describes a player-kind info by name, position, team, race and coach', () => {
    expect(service.describe(namedPlayer)).toBe(
      'Griff Oberwald (Blitzer, Gouged Eye, Orc, Grimly)',
    );
  });

  it('describes a team-kind info as an unidentified player from that team', () => {
    const info: PlayerKillerInfo = {
      kind: 'team',
      ...gougedEye,
      viaFoul: false,
    };

    expect(service.describe(info)).toBe(
      'An unidentified player from Gouged Eye (Orc, Grimly)',
    );
  });

  it('describes an ambiguousTeams info by joining every candidate with "or"', () => {
    const info: PlayerKillerInfo = {
      kind: 'ambiguousTeams',
      teams: [gougedEye, championsOfDeath, chaosAllStars],
      viaFoul: false,
    };

    expect(service.describe(info)).toBe(
      'An unidentified player from Gouged Eye (Orc, Grimly), Champions of Death (Undead, Mortis), or Chaos All-Stars (Chaos, Nurgle)',
    );
  });

  it('describes an unknown info as mysterious circumstances', () => {
    const info: PlayerKillerInfo = { kind: 'unknown', viaFoul: false };

    expect(service.describe(info)).toBe(
      'An opponent, in mysterious circumstances',
    );
  });

  it('builds a player entry via PlayerRowButtonService for a player-kind info', () => {
    expect(service.buildEntries(namedPlayer)).toEqual([
      {
        customIdPrefix: PLAYER_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '88',
        label: 'Griff Oberwald',
      },
    ]);
    expect(playerRowButton.buildPlayerRowButton).toHaveBeenCalledWith({
      playerId: 88,
      playerName: 'Griff Oberwald',
      positionId: 60,
      positionName: 'Blitzer',
      isStarPlayer: false,
    });
  });

  it('builds a team entry for a team-kind info', () => {
    const info: PlayerKillerInfo = {
      kind: 'team',
      ...gougedEye,
      viaFoul: false,
    };

    expect(service.buildEntries(info)).toEqual([
      {
        customIdPrefix: TEAM_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '12',
        label: 'Gouged Eye',
      },
    ]);
  });

  it('builds one team entry per candidate for an ambiguousTeams info, in order', () => {
    const info: PlayerKillerInfo = {
      kind: 'ambiguousTeams',
      teams: [gougedEye, championsOfDeath],
      viaFoul: false,
    };

    expect(service.buildEntries(info)).toEqual([
      {
        customIdPrefix: TEAM_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '12',
        label: 'Gouged Eye',
      },
      {
        customIdPrefix: TEAM_BUTTON_CUSTOM_ID_PREFIX,
        entityId: '13',
        label: 'Champions of Death',
      },
    ]);
  });

  it('builds no entries for an unknown info', () => {
    const info: PlayerKillerInfo = { kind: 'unknown', viaFoul: false };

    expect(service.buildEntries(info)).toEqual([]);
  });
});
