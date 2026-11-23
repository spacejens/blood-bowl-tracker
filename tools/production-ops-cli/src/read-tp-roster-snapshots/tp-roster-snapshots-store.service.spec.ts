import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  GitRootsService,
  WriteFileService,
} from '@blood-bowl-tracker/cli-shared';
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
  let root: string;
  let dataDir: string;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'tp-roster-snapshots-'));
    dataDir = join(root, 'tools/import-tp/data');
    gitRoots = mock<GitRootsService>();
    writeFile = mock<WriteFileService>();
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
      ],
    }).compile();
    service = moduleRef.get(TpRosterSnapshotsStoreService);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function put(relative: string, text = '{}'): void {
    mkdirSync(join(dataDir, relative, '..'), { recursive: true });
    writeFileSync(join(dataDir, relative), text);
  }

  it('reads the TP downloads of this checkout, resolving the root once', async () => {
    await expect(service.dataDir()).resolves.toBe(dataDir);
    await service.dataDir();

    expect(gitRoots.resolve).toHaveBeenCalledTimes(1);
  });

  it('lists every match and roster file, sorted, and nothing else', async () => {
    put('third-era/s29/match_2.json');
    put('fourth-era/s30/rosters_41063.json');
    put('fourth-era/s30/match_10.json');
    put('teams/BB2020/rosters_masters?ruleSet=20.json');
    put('third-era/s29/tournament_s29.json');

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
  });

  it('follows a symlinked data directory, as a worktree has', async () => {
    const real = join(root, 'main-checkout-data');
    mkdirSync(join(real, 'e/c'), { recursive: true });
    writeFileSync(join(real, 'e/c/match_1.json'), '{}');
    mkdirSync(join(dataDir, '..'), { recursive: true });
    symlinkSync(real, dataDir);

    const files = await service.listSources();

    expect(files).toHaveLength(1);
    expect(files[0].source).toBe('e/c/match_1.json');
  });

  it('tells how to link the downloads when the data directory is missing', async () => {
    await expect(service.listSources()).rejects.toThrow(/sync-gitignored/);
  });

  it('reads a source file as JSON', async () => {
    put('e/match_1.json', '{"a":1}');
    const [file] = await service.listSources();

    await expect(service.readSource(file)).resolves.toEqual({ a: 1 });
  });

  it('names the file that is not valid JSON', async () => {
    put('e/match_1.json', '{');
    const [file] = await service.listSources();

    await expect(service.readSource(file)).rejects.toThrow(
      /match_1\.json is not valid JSON/,
    );
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
    mkdirSync(join(dataDir, '..'), { recursive: true });
    writeFileSync(dataDir, 'not a directory');

    await expect(service.listSources()).rejects.toThrow(/ENOTDIR/);
  });
});
