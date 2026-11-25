import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  GitRootsService,
  WriteFileService,
} from '@blood-bowl-tracker/cli-shared';
import {
  TpFileNameService,
  TpFilesReaderService,
} from '@blood-bowl-tracker/read-tp-files';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import type { TpRosterSnapshots } from './tp-roster-snapshots.schema';
import {
  TP_ROSTER_SNAPSHOTS_FILE,
  TpRosterSnapshotsStoreService,
} from './tp-roster-snapshots-store.service';

const SNAPSHOTS: TpRosterSnapshots = {
  players: {
    '5': [
      {
        lineUpMasterId: 288,
        level: 0,
        skillMasterIds: [96],
        totalSpp: 6,
        unspentSpp: 6,
        sources: ['a/match_1.json'],
      },
    ],
  },
  conflicts: [],
  unreadable: [],
  rosterCopies: [
    {
      era: 'fourth-era',
      rosterId: '164848',
      chosen: ['fourth-era/s30/rosters_164848.json'],
      listed: ['5'],
      listedElsewhere: [],
    },
  ],
};

describe('TpRosterSnapshotsStoreService', () => {
  let service: TpRosterSnapshotsStoreService;
  let gitRoots: MockProxy<GitRootsService>;
  let writeFile: MockProxy<WriteFileService>;
  let tpFiles: MockProxy<TpFilesReaderService>;
  let root: string;
  let dataDir: string;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'tp-roster-snapshots-'));
    dataDir = join(root, 'tools/import-tp/data');
    gitRoots = mock<GitRootsService>();
    writeFile = mock<WriteFileService>();
    tpFiles = mock<TpFilesReaderService>();
    tpFiles.listEras.mockResolvedValue([]);
    gitRoots.resolve.mockResolvedValue({
      mainRoot: root,
      worktreeRoot: root,
      isWorktree: false,
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpRosterSnapshotsStoreService,
        { provide: GitRootsService, useValue: gitRoots },
        { provide: WriteFileService, useValue: writeFile },
        { provide: TpFilesReaderService, useValue: tpFiles },
        TpFileNameService,
      ],
    }).compile();
    service = moduleRef.get(TpRosterSnapshotsStoreService);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function layout(tree: Record<string, Record<string, string[]>>): void {
    mkdirSync(dataDir, { recursive: true });
    tpFiles.listEras.mockResolvedValue(Object.keys(tree));
    tpFiles.listCompetitions.mockImplementation((_dir, era) =>
      Promise.resolve(Object.keys(tree[era])),
    );
    tpFiles.listFiles.mockImplementation((_dir, era, competition) =>
      Promise.resolve(tree[era][competition]),
    );
  }

  it('reads the TP downloads of this checkout, resolving the root once', async () => {
    await expect(service.dataDir()).resolves.toBe(dataDir);
    await service.dataDir();

    expect(gitRoots.resolve).toHaveBeenCalledTimes(1);
  });

  it('lists every match and roster file, sorted, and nothing else', async () => {
    layout({
      'third-era': { s29: ['match_2.json', 'tournament_s29.json'] },
      'fourth-era': {
        s30: ['rosters_41063.json', 'match_10.json', 'awards_x_awards.json'],
      },
    });

    await expect(service.listSources()).resolves.toEqual([
      {
        kind: 'match',
        source: 'fourth-era/s30/match_10.json',
        path: join(dataDir, 'fourth-era/s30/match_10.json'),
      },
      {
        kind: 'roster',
        source: 'fourth-era/s30/rosters_41063.json',
        path: join(dataDir, 'fourth-era/s30/rosters_41063.json'),
      },
      {
        kind: 'match',
        source: 'third-era/s29/match_2.json',
        path: join(dataDir, 'third-era/s29/match_2.json'),
      },
    ]);
    expect(tpFiles.listEras).toHaveBeenCalledWith(dataDir);
  });

  it('lists neither the official-teams masters nor a rosters file under teams', async () => {
    layout({
      teams: {
        BB2020: ['rosters_masters?ruleSet=20.json', 'rosters_1.json'],
      },
    });
    tpFiles.listEras.mockResolvedValue([]);

    await expect(service.listSources()).resolves.toEqual([]);
  });

  it('tells how to link the downloads when the data directory is missing', async () => {
    await expect(service.listSources()).rejects.toThrow(/sync-gitignored/);
  });

  it('reads a source file through the TP files reader', async () => {
    tpFiles.readJson.mockResolvedValue({ path: 'p', content: { a: 1 } });
    const file = {
      kind: 'match' as const,
      source: 'e/c/match_1.json',
      path: join(dataDir, 'e/c/match_1.json'),
    };

    await expect(service.readSource(file)).resolves.toEqual({ a: 1 });
    expect(tpFiles.readJson).toHaveBeenCalledWith(dataDir, [
      'e',
      'c',
      'match_1.json',
    ]);
  });

  it('names a source file that is gone', async () => {
    tpFiles.readJson.mockResolvedValue(null);

    await expect(
      service.readSource({
        kind: 'match',
        source: 'e/c/match_1.json',
        path: join(dataDir, 'e/c/match_1.json'),
      }),
    ).rejects.toThrow(/match_1\.json does not exist/);
  });

  it('writes the snapshots through WriteFileService', async () => {
    writeFile.run.mockResolvedValue({
      written: TP_ROSTER_SNAPSHOTS_FILE,
      bytes: 9,
    });

    await expect(service.writeSnapshots(SNAPSHOTS)).resolves.toEqual({
      written: TP_ROSTER_SNAPSHOTS_FILE,
      bytes: 9,
    });
    expect(writeFile.run).toHaveBeenCalledWith(
      TP_ROSTER_SNAPSHOTS_FILE,
      `${JSON.stringify(SNAPSHOTS, null, 2)}\n`,
    );
  });

  describe('reading the saved snapshots', () => {
    function save(text: string): void {
      const path = join(root, TP_ROSTER_SNAPSHOTS_FILE);
      mkdirSync(join(path, '..'), { recursive: true });
      writeFileSync(path, text);
    }

    it('reads back a valid file', async () => {
      save(JSON.stringify(SNAPSHOTS));

      await expect(service.readSnapshots()).resolves.toEqual(SNAPSHOTS);
    });

    it('asks for the collector to be run when there is none', async () => {
      await expect(service.readSnapshots()).rejects.toThrow(
        /run read-tp-roster-snapshots first/,
      );
    });

    it('asks for a rerun when the file was saved without roster copies', async () => {
      const older: Record<string, unknown> = { ...SNAPSHOTS };
      delete older.rosterCopies;
      save(JSON.stringify(older));

      await expect(service.readSnapshots()).rejects.toThrow(
        /rosterCopies[\s\S]*run read-tp-roster-snapshots again/,
      );
    });

    it('refuses a file of another shape', async () => {
      save(JSON.stringify({ players: { x: [] } }));

      await expect(service.readSnapshots()).rejects.toThrow(
        /is not a valid TP roster snapshots file/,
      );
    });

    it('passes on an error other than a missing file', async () => {
      mkdirSync(join(root, TP_ROSTER_SNAPSHOTS_FILE), { recursive: true });

      await expect(service.readSnapshots()).rejects.toThrow(/EISDIR/);
    });
  });

  it('passes on a data directory error other than a missing one', async () => {
    writeFileSync(join(root, 'tools'), 'not a directory');

    await expect(service.listSources()).rejects.toThrow(/ENOTDIR/);
  });
});
