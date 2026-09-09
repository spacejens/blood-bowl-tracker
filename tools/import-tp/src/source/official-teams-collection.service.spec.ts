import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { ImportError } from '@blood-bowl-tracker/import';
import { ImportResultService } from '@blood-bowl-tracker/import';
import { OfficialTeamsParserService } from '@blood-bowl-tracker/parse-tp';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
    },
  ],
};

describe('OfficialTeamsCollectionService', () => {
  let service: OfficialTeamsCollectionService;
  let sourceConfig: MockProxy<SourceConfigService>;
  let parser: MockProxy<OfficialTeamsParserService>;
  let importResults: MockProxy<ImportResultService>;
  let dir: string;
  let errors: ImportError[];

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'official-teams-'));
    errors = [];
    sourceConfig = mock<SourceConfigService>();
    parser = mock<OfficialTeamsParserService>();
    importResults = mock<ImportResultService>();
    sourceConfig.getDataDir.mockReturnValue(dir);
    importResults.error.mockImplementation(
      ({ message }) => ({ message }) as ImportError,
    );

    const moduleRef = await Test.createTestingModule({
      providers: [
        OfficialTeamsCollectionService,
        { provide: SourceConfigService, useValue: sourceConfig },
        { provide: OfficialTeamsParserService, useValue: parser },
        { provide: ImportResultService, useValue: importResults },
      ],
    }).compile();
    service = moduleRef.get(OfficialTeamsCollectionService);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function writeRulesSetFile(rulesSet: string, fileName: string): void {
    const rulesSetDir = join(dir, 'teams', rulesSet);
    mkdirSync(rulesSetDir, { recursive: true });
    writeFileSync(join(rulesSetDir, fileName), '{"races":[]}', 'utf8');
  }

  it('tags every parsed race with the rules set folder it came from', async () => {
    writeRulesSetFile('BB2020', 'teams_Amazon.json');
    parser.parse.mockReturnValue([AMAZON]);

    const entries = await service.collect(errors);

    expect(entries).toEqual([{ race: AMAZON, rulesSet: 'BB2020' }]);
    expect(errors).toEqual([]);
  });

  it('reads every rules set folder and every file in it', async () => {
    writeRulesSetFile('BB2020', 'teams_Amazon.json');
    writeRulesSetFile('BB2020', 'teams_Dwarf.json');
    writeRulesSetFile('BB2025', 'teams_Amazon.json');
    parser.parse.mockReturnValue([AMAZON]);

    const entries = await service.collect(errors);

    expect(entries).toHaveLength(3);
    expect(new Set(entries.map((entry) => entry.rulesSet))).toEqual(
      new Set(['BB2020', 'BB2025']),
    );
  });

  it('skips non-json files', async () => {
    writeRulesSetFile('BB2020', 'teams_Amazon.json');
    writeFileSync(join(dir, 'teams', 'BB2020', 'notes.txt'), 'x', 'utf8');
    parser.parse.mockReturnValue([AMAZON]);

    expect(await service.collect(errors)).toHaveLength(1);
  });

  it('records an error and skips a file the parser rejects, keeping the others', async () => {
    writeRulesSetFile('BB2020', 'teams_Amazon.json');
    writeRulesSetFile('BB2020', 'teams_Broken.json');
    parser.parse.mockImplementation((_content) => {
      throw new Error('bad shape');
    });

    const entries = await service.collect(errors);

    expect(entries).toEqual([]);
    expect(errors).toHaveLength(2);
    expect(errors[0].message).toContain('bad shape');
    expect(errors[0].message).toContain('BB2020');
  });

  it('records one error and returns nothing when the teams directory is missing', async () => {
    const entries = await service.collect(errors);

    expect(entries).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain('teams');
  });

  // chmodSync(dir, 0o000) is not reliably enforced when the test process runs
  // as root (root can read a directory regardless of its mode) or on
  // Windows (which does not model this permission bit the same way), so this
  // test only exercises real behavior on a non-root POSIX runner.
  const canRelyOnDirectoryPermissions =
    process.platform !== 'win32' && process.getuid?.() !== 0;

  it.skipIf(!canRelyOnDirectoryPermissions)(
    'records one error and keeps other rules sets when a rules set directory cannot be scanned',
    async () => {
      writeRulesSetFile('BB2020', 'teams_Amazon.json');
      const badDir = join(dir, 'teams', 'BB2025');
      mkdirSync(badDir, { recursive: true });
      chmodSync(badDir, 0o000);
      parser.parse.mockReturnValue([AMAZON]);

      try {
        const entries = await service.collect(errors);

        expect(entries).toEqual([{ race: AMAZON, rulesSet: 'BB2020' }]);
        expect(errors).toHaveLength(1);
        expect(errors[0].message).toContain('BB2025');
      } finally {
        chmodSync(badDir, 0o755);
      }
    },
  );
});
