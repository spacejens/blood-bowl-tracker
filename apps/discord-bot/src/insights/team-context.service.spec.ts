import { TeamsService } from '@blood-bowl-tracker/game-data';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { TeamContextService } from './team-context.service';

describe('TeamContextService', () => {
  let service: TeamContextService;
  let teams: MockProxy<TeamsService>;

  beforeEach(async () => {
    teams = mock<TeamsService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TeamContextService,
        { provide: TeamsService, useValue: teams },
      ],
    }).compile();
    service = moduleRef.get(TeamContextService);
  });

  it('appends race and coach when both are requested', async () => {
    teams.getRaceAndCoachNamesByIds.mockResolvedValue(
      new Map([[7, { raceName: 'Orc', coachName: 'Skarsnik' }]]),
    );
    const decorated = await service.attachSuffixes(
      [{ teamId: 7, name: 'Da Green Machine', count: 12 }],
      (row) => row.teamId,
      { includeRace: true, includeCoach: true },
    );
    expect(decorated[0].contextSuffix).toBe(' (Orc, Skarsnik)');
  });

  it('appends only the race when the coach is not requested', async () => {
    teams.getRaceAndCoachNamesByIds.mockResolvedValue(
      new Map([[7, { raceName: 'Orc', coachName: 'Skarsnik' }]]),
    );
    const decorated = await service.attachSuffixes(
      [{ teamId: 7, name: 'Da Green Machine', count: 12 }],
      (row) => row.teamId,
      { includeRace: true, includeCoach: false },
    );
    expect(decorated[0].contextSuffix).toBe(' (Orc)');
  });

  it('appends only the coach when the race is not requested', async () => {
    teams.getRaceAndCoachNamesByIds.mockResolvedValue(
      new Map([[7, { raceName: 'Orc', coachName: 'Skarsnik' }]]),
    );
    const decorated = await service.attachSuffixes(
      [{ teamId: 7, name: 'Da Green Machine', count: 12 }],
      (row) => row.teamId,
      { includeRace: false, includeCoach: true },
    );
    expect(decorated[0].contextSuffix).toBe(' (Skarsnik)');
  });

  it('preserves every original row property and its order', async () => {
    teams.getRaceAndCoachNamesByIds.mockResolvedValue(
      new Map([
        [7, { raceName: 'Orc', coachName: 'Skarsnik' }],
        [8, { raceName: 'Dwarf', coachName: 'Roze Madder' }],
      ]),
    );
    const decorated = await service.attachSuffixes(
      [
        { teamId: 7, name: 'Da Green Machine', count: 12 },
        { teamId: 8, name: '40 grinders', count: 9 },
      ],
      (row) => row.teamId,
      { includeRace: true, includeCoach: true },
    );
    expect(decorated).toEqual([
      {
        teamId: 7,
        name: 'Da Green Machine',
        count: 12,
        contextSuffix: ' (Orc, Skarsnik)',
      },
      {
        teamId: 8,
        name: '40 grinders',
        count: 9,
        contextSuffix: ' (Dwarf, Roze Madder)',
      },
    ]);
  });

  it('looks the ids up in one batched call, using the supplied accessor', async () => {
    teams.getRaceAndCoachNamesByIds.mockResolvedValue(new Map());
    await service.attachSuffixes(
      [
        { id: 3, name: 'A', count: 1 },
        { id: 4, name: 'B', count: 1 },
      ],
      (row) => row.id,
      { includeRace: true, includeCoach: false },
    );
    expect(teams.getRaceAndCoachNamesByIds).toHaveBeenCalledTimes(1);
    expect(teams.getRaceAndCoachNamesByIds).toHaveBeenCalledWith([3, 4]);
  });

  it('returns an empty array without querying when there are no rows', async () => {
    const decorated = await service.attachSuffixes(
      [] as { teamId: number }[],
      (row) => row.teamId,
      { includeRace: true, includeCoach: true },
    );
    expect(decorated).toEqual([]);
    expect(teams.getRaceAndCoachNamesByIds).not.toHaveBeenCalled();
  });

  it('falls back to an empty suffix for a team the lookup did not return', async () => {
    teams.getRaceAndCoachNamesByIds.mockResolvedValue(new Map());
    const decorated = await service.attachSuffixes(
      [{ teamId: 7, name: 'Da Green Machine', count: 12 }],
      (row) => row.teamId,
      { includeRace: true, includeCoach: true },
    );
    expect(decorated[0].contextSuffix).toBe('');
  });
});
