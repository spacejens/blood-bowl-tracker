import { ExternalSystemsImportService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

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
    competitions: [],
  };
}

describe('ExternalSystemsProcessor', () => {
  let processor: ExternalSystemsProcessor;
  let externalSystemsImport: MockProxy<ExternalSystemsImportService>;

  beforeEach(async () => {
    externalSystemsImport = mock<ExternalSystemsImportService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ExternalSystemsProcessor,
        {
          provide: ExternalSystemsImportService,
          useValue: externalSystemsImport,
        },
      ],
    }).compile();
    processor = moduleRef.get(ExternalSystemsProcessor);
  });

  it('collects every distinct system name from all sections and pairs', async () => {
    const seen: string[] = [];
    externalSystemsImport.upsertExternalSystem.mockImplementation((name) => {
      seen.push(name);
      return Promise.resolve(seen.length);
    });
    const data = emptyData();
    data.externalSystems = [
      { name: 'Explicit', category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
      { name: 'RulesSys', category: 'imported_data_source' },
      { name: 'LeagueSys', category: 'imported_data_source' },
      { name: 'BBL', category: 'imported_data_source' },
      { name: 'RS', category: 'imported_data_source' },
      { name: 'RaceEraSys', category: 'imported_data_source' },
      { name: 'RaceSys', category: 'imported_data_source' },
      { name: 'CoachSys', category: 'imported_data_source' },
    ];
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

    const systemIds = await processor.bootstrap(data);

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
    expect(externalSystemsImport.upsertExternalSystem).toHaveBeenCalledWith(
      'BBL',
      'imported_data_source',
    );
    expect(externalSystemsImport.upsertExternalSystem).toHaveBeenCalledWith(
      'Name',
      'bookkeeping',
    );
  });

  it('upserts each name once even when referenced many times', async () => {
    externalSystemsImport.upsertExternalSystem.mockResolvedValue(1);
    const data = emptyData();
    data.externalSystems = [{ name: 'Name', category: 'bookkeeping' }];
    data.coaches = [
      { name: 'A', externalIds: [{ system: 'Name', id: 'name:a' }] },
      { name: 'B', externalIds: [{ system: 'Name', id: 'name:b' }] },
    ];

    await processor.bootstrap(data);

    expect(externalSystemsImport.upsertExternalSystem).toHaveBeenCalledTimes(1);
    expect(externalSystemsImport.upsertExternalSystem).toHaveBeenCalledWith(
      'Name',
      'bookkeeping',
    );
  });

  it('collects position raceEras race and era system names', async () => {
    externalSystemsImport.upsertExternalSystem.mockResolvedValue(1);
    const data = emptyData();
    data.externalSystems = [
      { name: 'RaceSys', category: 'imported_data_source' },
      { name: 'EraSys', category: 'imported_data_source' },
      { name: 'Name', category: 'bookkeeping' },
    ];
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

    await processor.bootstrap(data);

    const names = externalSystemsImport.upsertExternalSystem.mock.calls.map(
      (c) => c[0],
    );
    expect(names).toContain('RaceSys');
    expect(names).toContain('EraSys');
    expect(externalSystemsImport.upsertExternalSystem).toHaveBeenCalledWith(
      'RaceSys',
      'imported_data_source',
    );
    expect(externalSystemsImport.upsertExternalSystem).toHaveBeenCalledWith(
      'EraSys',
      'imported_data_source',
    );
    expect(externalSystemsImport.upsertExternalSystem).toHaveBeenCalledWith(
      'Name',
      'bookkeeping',
    );
  });

  it('upserts a declared NAF system with its declared category', async () => {
    externalSystemsImport.upsertExternalSystem.mockResolvedValue(1);
    const data = emptyData();
    data.externalSystems = [
      { name: 'NAF', category: 'referenced_not_imported' },
    ];
    data.coaches = [
      { name: 'A', externalIds: [{ system: 'NAF', id: 'naf:1' }] },
    ];

    await processor.bootstrap(data);

    expect(externalSystemsImport.upsertExternalSystem).toHaveBeenCalledWith(
      'NAF',
      'referenced_not_imported',
    );
  });

  it('throws when a referenced system is not declared in externalSystems', async () => {
    externalSystemsImport.upsertExternalSystem.mockResolvedValue(1);
    const data = emptyData();
    data.coaches = [
      { name: 'A', externalIds: [{ system: 'Undeclared', id: 'id:1' }] },
    ];

    await expect(processor.bootstrap(data)).rejects.toThrow(
      'External system "Undeclared" is referenced but not declared in externalSystems',
    );
    expect(externalSystemsImport.upsertExternalSystem).not.toHaveBeenCalled();
  });

  it('throws when the same system is declared with conflicting categories', async () => {
    externalSystemsImport.upsertExternalSystem.mockResolvedValue(1);
    const data = emptyData();
    data.externalSystems = [
      { name: 'Name', category: 'bookkeeping' },
      { name: 'Name', category: 'imported_data_source' },
    ];

    await expect(processor.bootstrap(data)).rejects.toThrow(
      'External system "Name" is declared with conflicting categories: "bookkeeping" and "imported_data_source"',
    );
    expect(externalSystemsImport.upsertExternalSystem).not.toHaveBeenCalled();
  });

  it('propagates an upsert failure', async () => {
    externalSystemsImport.upsertExternalSystem.mockRejectedValue(
      new Error('api down'),
    );
    const data = emptyData();
    data.externalSystems = [{ name: 'Name', category: 'bookkeeping' }];
    data.coaches = [
      { name: 'A', externalIds: [{ system: 'Name', id: 'name:a' }] },
    ];

    await expect(processor.bootstrap(data)).rejects.toThrow('api down');
  });

  it('bootstraps the systems a competition references', async () => {
    const seen: string[] = [];
    externalSystemsImport.upsertExternalSystem.mockImplementation((name) => {
      seen.push(name);
      return Promise.resolve(seen.length);
    });
    const data = emptyData();
    data.externalSystems = [
      { name: 'CompSys', category: 'imported_data_source' },
      { name: 'CompEraSys', category: 'imported_data_source' },
    ];
    data.competitions = [
      {
        name: 'Major Season 12',
        type: 'season',
        era: { system: 'CompEraSys', id: 'era:1' },
        externalIds: [{ system: 'CompSys', id: 'comp:1' }],
      },
    ];

    const systemIds = await processor.bootstrap(data);

    expect([...systemIds.keys()].sort()).toEqual(['CompEraSys', 'CompSys']);
  });

  // A rename-only overlay (see "Upserts overlay, they do not replace" in
  // docs/api/imports.md) legitimately omits a cross-reference field like
  // league/race/coach/era, since the payload only renames a row rather than
  // relinking it. An absent ref has nothing to resolve against another
  // entity, so it simply contributes no system name to collect — it must be
  // skipped by `addIfPresent`, not dereferenced.
  it('skips absent cross-reference fields when collecting system names', async () => {
    externalSystemsImport.upsertExternalSystem.mockResolvedValue(1);
    const data = emptyData();
    data.externalSystems = [{ name: 'Name', category: 'bookkeeping' }];
    data.eras = [
      {
        name: 'Renamed Era',
        rulesSets: [],
        externalIds: [{ system: 'Name', id: 'name:renamed-era' }],
      },
    ];
    data.teams = [
      {
        name: 'Renamed Team',
        eras: [],
        externalIds: [{ system: 'Name', id: 'name:renamed-team' }],
      },
    ];
    data.competitions = [
      {
        name: 'Renamed Competition',
        externalIds: [{ system: 'Name', id: 'name:renamed-competition' }],
      },
    ];

    const systemIds = await processor.bootstrap(data);

    expect([...systemIds.keys()]).toEqual(['Name']);
  });
});
