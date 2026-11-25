import type { ImportError } from '@blood-bowl-tracker/import';
import { ImportResultService } from '@blood-bowl-tracker/import';
import { OfficialTeamsParserService } from '@blood-bowl-tracker/parse-tp';
import { TpFilesReaderService } from '@blood-bowl-tracker/read-tp-files';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { OfficialTeamsCollectionService } from './official-teams-collection.service';
import { SourceConfigService } from './source-config.service';

const AMAZON = {
  name: 'Amazon',
  teamRaceCode: 'Amazon_BB2020',
  isOfficial: true,
  positions: [
    {
      name: 'Eagle Warrior Linewoman',
      isStarPlayer: false,
      tpPositionId: 101,
      characteristics: {
        move: 6,
        strength: 3,
        agility: 3,
        passing: 4,
        armour: 8,
      },
      skills: [],
      keywordCodes: [],
      skillCategories: { primary: [], secondary: [] },
    },
  ],
};

const DATA_DIR = '/data';

describe('OfficialTeamsCollectionService', () => {
  let service: OfficialTeamsCollectionService;
  let sourceConfig: MockProxy<SourceConfigService>;
  let parser: MockProxy<OfficialTeamsParserService>;
  let importResults: MockProxy<ImportResultService>;
  let files: MockProxy<TpFilesReaderService>;
  let errors: ImportError[];

  beforeEach(async () => {
    errors = [];
    sourceConfig = mock<SourceConfigService>();
    parser = mock<OfficialTeamsParserService>();
    importResults = mock<ImportResultService>();
    files = mock<TpFilesReaderService>();
    sourceConfig.getDataDir.mockReturnValue(DATA_DIR);
    importResults.error.mockImplementation(
      ({ message }) => ({ message }) as ImportError,
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        OfficialTeamsCollectionService,
        { provide: SourceConfigService, useValue: sourceConfig },
        { provide: OfficialTeamsParserService, useValue: parser },
        { provide: ImportResultService, useValue: importResults },
        { provide: TpFilesReaderService, useValue: files },
      ],
    }).compile();
    service = moduleRef.get(OfficialTeamsCollectionService);
  });

  /** Lists each rules set's files and makes readJson return `{}` for them. */
  function seed(layout: Record<string, string[]>): void {
    files.listTeamsRulesSets.mockResolvedValue(Object.keys(layout));
    files.listTeamsFiles.mockImplementation((_dataDir, rulesSet) =>
      Promise.resolve(layout[rulesSet]),
    );
    files.readJson.mockImplementation((_dataDir, segments) =>
      Promise.resolve({ path: segments.join('/'), content: {} }),
    );
  }

  it('tags every parsed race with the rules set folder it came from', async () => {
    seed({ BB2020: ['teams_Amazon.json'] });
    parser.parse.mockReturnValue([AMAZON]);

    const entries = await service.collect(errors);

    expect(entries).toEqual([{ race: AMAZON, rulesSet: 'BB2020' }]);
    expect(errors).toEqual([]);
    expect(files.readJson).toHaveBeenCalledWith(DATA_DIR, [
      'teams',
      'BB2020',
      'teams_Amazon.json',
    ]);
  });

  it('reads every rules set folder and every file in it', async () => {
    seed({
      BB2020: ['teams_Amazon.json', 'teams_Dwarf.json'],
      BB2025: ['teams_Amazon.json'],
    });
    parser.parse.mockReturnValue([AMAZON]);

    const entries = await service.collect(errors);

    expect(entries).toHaveLength(3);
    expect(new Set(entries.map((entry) => entry.rulesSet))).toEqual(
      new Set(['BB2020', 'BB2025']),
    );
  });

  it('records an error and skips a file the parser rejects, keeping the others', async () => {
    seed({ BB2020: ['teams_Amazon.json', 'teams_Broken.json'] });
    parser.parse.mockImplementation((_content) => {
      throw new Error('bad shape');
    });

    const entries = await service.collect(errors);

    expect(entries).toEqual([]);
    expect(errors).toHaveLength(2);
    expect(errors[0].message).toContain('bad shape');
    expect(errors[0].message).toContain('BB2020');
  });

  it('records a file that cannot be read and keeps the others', async () => {
    seed({ BB2020: ['teams_Amazon.json', 'teams_Broken.json'] });
    files.readJson.mockImplementation((_dataDir, segments) =>
      segments[2] === 'teams_Broken.json'
        ? Promise.reject(new Error('Failed to parse TP file x'))
        : Promise.resolve({ path: 'x', content: {} }),
    );
    parser.parse.mockReturnValue([AMAZON]);

    const entries = await service.collect(errors);

    expect(entries).toEqual([{ race: AMAZON, rulesSet: 'BB2020' }]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('Failed to parse TP file x');
  });

  it('skips a file that vanished between listing and reading', async () => {
    seed({ BB2020: ['teams_Amazon.json'] });
    files.readJson.mockResolvedValue(null);

    expect(await service.collect(errors)).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('reports a non-Error parser failure by its string form', async () => {
    seed({ BB2020: ['teams_Amazon.json'] });
    parser.parse.mockImplementation((_content) => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'plain failure';
    });

    await service.collect(errors);

    expect(errors[0].message).toContain('plain failure');
  });

  it('returns nothing and no error when the teams directory is missing', async () => {
    files.listTeamsRulesSets.mockResolvedValue([]);

    expect(await service.collect(errors)).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('records one error and returns nothing when the teams directory cannot be listed', async () => {
    files.listTeamsRulesSets.mockRejectedValue(new Error('EACCES'));

    expect(await service.collect(errors)).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('teams');
    expect(errors[0].message).toContain('EACCES');
  });

  it('reports a non-Error listing failure by its string form', async () => {
    files.listTeamsRulesSets.mockRejectedValue('plain listing failure');

    await service.collect(errors);

    expect(errors[0].message).toContain('plain listing failure');
  });

  it('records one error and keeps other rules sets when a rules set cannot be listed', async () => {
    files.listTeamsRulesSets.mockResolvedValue(['BB2020', 'BB2025']);
    files.listTeamsFiles.mockImplementation((_dataDir, rulesSet) =>
      rulesSet === 'BB2025'
        ? Promise.reject(new Error('EACCES'))
        : Promise.resolve(['teams_Amazon.json']),
    );
    files.readJson.mockResolvedValue({ path: 'x', content: {} });
    parser.parse.mockReturnValue([AMAZON]);

    const entries = await service.collect(errors);

    expect(entries).toEqual([{ race: AMAZON, rulesSet: 'BB2020' }]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('BB2025');
  });

  it('reports a non-Error rules set listing failure by its string form', async () => {
    files.listTeamsRulesSets.mockResolvedValue(['BB2020']);
    files.listTeamsFiles.mockRejectedValue('plain rules set failure');

    await service.collect(errors);

    expect(errors[0].message).toContain('plain rules set failure');
  });
});
