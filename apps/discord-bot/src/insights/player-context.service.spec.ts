import { PlayersService } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { PlayerContextService } from './player-context.service';

const griffContext = {
  positionName: 'Blitzer',
  teamName: 'Reikland Reavers',
  raceName: 'Human',
  eraName: 'First era',
  coachName: 'Roze Madder',
};

const ALL = {
  includePosition: true,
  includeTeam: true,
  includeRace: true,
  includeEra: true,
  includeCoach: true,
};

describe('PlayerContextService', () => {
  let service: PlayerContextService;
  let players: MockProxy<PlayersService>;

  beforeEach(async () => {
    players = mock<PlayersService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayerContextService,
        { provide: PlayersService, useValue: players },
      ],
    }).compile();
    service = moduleRef.get(PlayerContextService);
  });

  it('appends position, team, race, era and coach in that order when all are requested', async () => {
    players.getContextNamesByIds.mockResolvedValue(
      new Map([[7, griffContext]]),
    );
    const decorated = await service.attachSuffixes(
      [{ playerId: 7, name: 'Griff Oberwald', count: 12 }],
      (row) => row.playerId,
      ALL,
    );
    expect(decorated[0].contextSuffix).toBe(
      ' (Blitzer, Reikland Reavers, Human, First era, Roze Madder)',
    );
  });

  it('leaves the era out when it is not requested', async () => {
    players.getContextNamesByIds.mockResolvedValue(
      new Map([[7, griffContext]]),
    );
    const decorated = await service.attachSuffixes(
      [{ playerId: 7, name: 'Griff Oberwald', count: 12 }],
      (row) => row.playerId,
      { ...ALL, includeEra: false },
    );
    expect(decorated[0].contextSuffix).toBe(
      ' (Blitzer, Reikland Reavers, Human, Roze Madder)',
    );
  });

  it('appends only the position and era when only those are requested', async () => {
    players.getContextNamesByIds.mockResolvedValue(
      new Map([[7, griffContext]]),
    );
    const decorated = await service.attachSuffixes(
      [{ playerId: 7, name: 'Griff Oberwald', count: 12 }],
      (row) => row.playerId,
      {
        includePosition: true,
        includeTeam: false,
        includeRace: false,
        includeEra: true,
        includeCoach: false,
      },
    );
    expect(decorated[0].contextSuffix).toBe(' (Blitzer, First era)');
  });

  it('produces an empty suffix when nothing is requested', async () => {
    players.getContextNamesByIds.mockResolvedValue(
      new Map([[7, griffContext]]),
    );
    const decorated = await service.attachSuffixes(
      [{ playerId: 7, name: 'Griff Oberwald', count: 12 }],
      (row) => row.playerId,
      {
        includePosition: false,
        includeTeam: false,
        includeRace: false,
        includeEra: false,
        includeCoach: false,
      },
    );
    expect(decorated[0].contextSuffix).toBe('');
  });

  it('preserves every original row property and its order', async () => {
    players.getContextNamesByIds.mockResolvedValue(
      new Map([
        [7, griffContext],
        [
          8,
          {
            positionName: 'Star Player',
            teamName: 'Da Green Machine',
            raceName: 'Orc',
            eraName: 'Second era',
            coachName: 'Skarsnik',
          },
        ],
      ]),
    );
    const decorated = await service.attachSuffixes(
      [
        { playerId: 7, name: 'Griff Oberwald', count: 12 },
        { playerId: 8, name: 'Morg n Thorg', count: 9 },
      ],
      (row) => row.playerId,
      ALL,
    );
    expect(decorated).toEqual([
      {
        playerId: 7,
        name: 'Griff Oberwald',
        count: 12,
        contextSuffix:
          ' (Blitzer, Reikland Reavers, Human, First era, Roze Madder)',
      },
      {
        playerId: 8,
        name: 'Morg n Thorg',
        count: 9,
        contextSuffix:
          ' (Star Player, Da Green Machine, Orc, Second era, Skarsnik)',
      },
    ]);
  });

  it('looks the ids up in one batched call, using the supplied accessor', async () => {
    players.getContextNamesByIds.mockResolvedValue(new Map());
    await service.attachSuffixes(
      [
        { id: 3, name: 'A', count: 1 },
        { id: 4, name: 'B', count: 1 },
      ],
      (row) => row.id,
      ALL,
    );
    expect(players.getContextNamesByIds).toHaveBeenCalledTimes(1);
    expect(players.getContextNamesByIds).toHaveBeenCalledWith([3, 4]);
  });

  it('returns an empty array without querying when there are no rows', async () => {
    const decorated = await service.attachSuffixes(
      [] as { playerId: number }[],
      (row) => row.playerId,
      ALL,
    );
    expect(decorated).toEqual([]);
    expect(players.getContextNamesByIds).not.toHaveBeenCalled();
  });

  it('falls back to an empty suffix for a player the lookup did not return', async () => {
    players.getContextNamesByIds.mockResolvedValue(new Map());
    const decorated = await service.attachSuffixes(
      [{ playerId: 7, name: 'Griff Oberwald', count: 12 }],
      (row) => row.playerId,
      ALL,
    );
    expect(decorated[0].contextSuffix).toBe('');
  });
});
