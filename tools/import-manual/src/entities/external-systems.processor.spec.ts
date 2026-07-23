import type { ExternalSystemsImportService } from '@blood-bowl-tracker/import';
import { describe, expect, it, vi } from 'vitest';

import type { ManualDataFile } from '../data-file/manual-data-file.schema';
import { ExternalSystemsProcessor } from './external-systems.processor';

function emptyData(): ManualDataFile {
  return {
    externalSystems: [],
    rulesSets: [],
    leagues: [],
    eras: [],
    races: [],
    positions: [],
    coaches: [],
    teams: [],
  };
}

function makeProcessor(upsertExternalSystem: ReturnType<typeof vi.fn>) {
  return new ExternalSystemsProcessor({
    upsertExternalSystem,
  } as unknown as ExternalSystemsImportService);
}

describe('ExternalSystemsProcessor', () => {
  it('collects every distinct system name from all sections and pairs', async () => {
    const seen: string[] = [];
    const upsert = vi.fn().mockImplementation((name: string) => {
      seen.push(name);
      return Promise.resolve(seen.length);
    });
    const data = emptyData();
    data.externalSystems = [{ name: 'Explicit' }];
    data.rulesSets = [
      { name: 'CRP', externalIds: [{ system: 'RulesSys', id: 'rs:crp' }] },
    ];
    data.leagues = [
      { name: 'EN', externalIds: [{ system: 'LeagueSys', id: 'lg:en' }] },
    ];
    data.coaches = [
      { name: 'Bob', externalIds: [{ system: 'Name', id: 'name:bob' }] },
    ];
    data.eras = [
      {
        name: 'E',
        league: { system: 'BBL', id: 'id:1' },
        rulesSets: [{ system: 'RS', id: 'name:crp' }],
        startDate: '2024-01-01',
        externalIds: [{ system: 'Name', id: 'name:e' }],
      },
    ];
    data.races = [
      {
        name: 'Orc',
        eras: [{ system: 'RaceEraSys', id: 'id:2' }],
        externalIds: [{ system: 'Name', id: 'name:orc' }],
      },
    ];
    data.teams = [
      {
        name: 'T',
        race: { system: 'RaceSys', id: 'id:9' },
        coach: { system: 'CoachSys', id: 'id:8' },
        eras: [{ system: 'BBL', id: 'id:1' }],
        externalIds: [{ system: 'Name', id: 'name:t' }],
      },
    ];

    const systemIds = await makeProcessor(upsert).bootstrap(data);

    expect(new Set(seen)).toEqual(
      new Set([
        'Explicit',
        'Name',
        'RulesSys',
        'LeagueSys',
        'BBL',
        'RS',
        'RaceEraSys',
        'RaceSys',
        'CoachSys',
      ]),
    );
    expect(systemIds.get('Name')).toBeDefined();
    expect(systemIds.get('Explicit')).toBeDefined();
    expect(upsert).toHaveBeenCalledWith('BBL', 'imported_data_source');
    expect(upsert).toHaveBeenCalledWith('Name', 'bookkeeping');
  });

  it('upserts each name once even when referenced many times', async () => {
    const upsert = vi.fn().mockResolvedValue(1);
    const data = emptyData();
    data.coaches = [
      { name: 'A', externalIds: [{ system: 'Name', id: 'name:a' }] },
      { name: 'B', externalIds: [{ system: 'Name', id: 'name:b' }] },
    ];

    await makeProcessor(upsert).bootstrap(data);

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert).toHaveBeenCalledWith('Name', 'bookkeeping');
  });

  it('collects position raceEras race and era system names', async () => {
    const upsert = vi.fn().mockResolvedValue(1);
    const data = emptyData();
    data.positions = [
      {
        name: 'Zombie',
        isStarPlayer: false,
        raceEras: [
          {
            race: { system: 'RaceSys', id: 'id:1' },
            era: { system: 'EraSys', id: 'id:2' },
          },
        ],
        externalIds: [{ system: 'Name', id: 'name:zombie' }],
      },
    ];

    await makeProcessor(upsert).bootstrap(data);

    const names = upsert.mock.calls.map((c) => c[0] as string);
    expect(names).toContain('RaceSys');
    expect(names).toContain('EraSys');
    expect(upsert).toHaveBeenCalledWith('RaceSys', 'imported_data_source');
    expect(upsert).toHaveBeenCalledWith('EraSys', 'imported_data_source');
    expect(upsert).toHaveBeenCalledWith('Name', 'bookkeeping');
  });

  it('propagates an upsert failure', async () => {
    const upsert = vi.fn().mockRejectedValue(new Error('api down'));
    const data = emptyData();
    data.coaches = [
      { name: 'A', externalIds: [{ system: 'Name', id: 'name:a' }] },
    ];

    await expect(makeProcessor(upsert).bootstrap(data)).rejects.toThrow(
      'api down',
    );
  });
});
