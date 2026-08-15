import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ManualDataReader } from './manual-data-reader.service';

describe('ManualDataReader', () => {
  let dir: string;
  let reader: ManualDataReader;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ManualDataReader],
    }).compile();
    reader = moduleRef.get(ManualDataReader);
    dir = mkdtempSync(join(tmpdir(), 'import-manual-data-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function write(name: string, contents: string): void {
    writeFileSync(join(dir, name), contents, 'utf8');
  }

  it('pools sections across multiple files', async () => {
    write(
      'a.json5',
      `{ coaches: [{ name: 'Bob', externalIds: [{ system: 'Name', id: 'name:bob' }] }] }`,
    );
    write(
      'b.json5',
      `{ coaches: [{ name: 'Sue', externalIds: [{ system: 'Name', id: 'name:sue' }] }],
         leagues: [{ name: 'L', externalIds: [{ system: 'Name', id: 'name:l' }] }] }`,
    );

    const data = await reader.read(dir);

    expect(data.coaches.map((c) => c.name)).toEqual(['Bob', 'Sue']);
    expect(data.leagues).toHaveLength(1);
  });

  it('reads files in alphabetical order', async () => {
    write(
      '2.json5',
      `{ coaches: [{ name: 'Second', externalIds: [{ system: 'Name', id: 'name:2' }] }] }`,
    );
    write(
      '1.json5',
      `{ coaches: [{ name: 'First', externalIds: [{ system: 'Name', id: 'name:1' }] }] }`,
    );

    const data = await reader.read(dir);

    expect(data.coaches.map((c) => c.name)).toEqual(['First', 'Second']);
  });

  it('follows a symlinked .json5 file', async () => {
    // data/after-other-importers symlinks the catalog files curated in
    // data/before-other-importers, and readdir never follows symlinks.
    write(
      'real.json5',
      `{ coaches: [{ name: 'Linked', externalIds: [{ system: 'Name', id: 'name:linked' }] }] }`,
    );
    symlinkSync(join(dir, 'real.json5'), join(dir, 'zz-link.json5'));

    const data = await reader.read(dir);

    expect(data.coaches.map((c) => c.name)).toEqual(['Linked', 'Linked']);
  });

  it('ignores non-.json5 files and subdirectories (non-recursive)', async () => {
    write(
      'keep.json5',
      `{ coaches: [{ name: 'Keep', externalIds: [{ system: 'Name', id: 'name:k' }] }] }`,
    );
    write('ignore.txt', 'not json5');
    write('ignore.json', `{ "coaches": [] }`);

    const data = await reader.read(dir);

    expect(data.coaches.map((c) => c.name)).toEqual(['Keep']);
  });

  it('ignores a .json5 symlink that points at a directory', async () => {
    write(
      'keep.json5',
      `{ coaches: [{ name: 'Keep', externalIds: [{ system: 'Name', id: 'name:k' }] }] }`,
    );
    mkdirSync(join(dir, 'a-real-dir'));
    symlinkSync(join(dir, 'a-real-dir'), join(dir, 'dir-link.json5'));

    const data = await reader.read(dir);

    expect(data.coaches.map((c) => c.name)).toEqual(['Keep']);
  });

  it('ignores a broken .json5 symlink', async () => {
    write(
      'keep.json5',
      `{ coaches: [{ name: 'Keep', externalIds: [{ system: 'Name', id: 'name:k' }] }] }`,
    );
    symlinkSync(join(dir, 'does-not-exist'), join(dir, 'broken-link.json5'));

    const data = await reader.read(dir);

    expect(data.coaches.map((c) => c.name)).toEqual(['Keep']);
  });

  it('propagates a stat() failure that is not a broken symlink', async () => {
    // A symlink loop makes stat() fail with ELOOP, not ENOENT -- only a
    // broken symlink's ENOENT is meant to be silently skipped; every other
    // stat() failure (permission errors, I/O errors, loops) must propagate
    // rather than be treated as "just not a file".
    symlinkSync(join(dir, 'b.json5'), join(dir, 'a.json5'));
    symlinkSync(join(dir, 'a.json5'), join(dir, 'b.json5'));

    await expect(reader.read(dir)).rejects.toThrow();
  });

  it('throws with the file path when a file is not valid JSON5', async () => {
    write('bad.json5', '{ not valid');
    await expect(reader.read(dir)).rejects.toThrow(join(dir, 'bad.json5'));
  });

  it('throws with the file path when a file has an invalid shape', async () => {
    write('bad.json5', `{ coaches: [{ name: 'NoIds', externalIds: [] }] }`);
    await expect(reader.read(dir)).rejects.toThrow(join(dir, 'bad.json5'));
  });

  it('rejects when the directory does not exist', async () => {
    await expect(reader.read(join(dir, 'nope'))).rejects.toThrow();
  });

  it('pools the competitions section across files', async () => {
    write(
      'a.json5',
      `{ competitions: [{ name: 'A', type: 'cup',
         era: { system: 'Name', id: 'name:e' },
         externalIds: [{ system: 'Name', id: 'name:a' }] }] }`,
    );
    write(
      'b.json5',
      `{ competitions: [{ name: 'B', type: 'season',
         era: { system: 'Name', id: 'name:e' },
         externalIds: [{ system: 'Name', id: 'name:b' }] }] }`,
    );

    const data = await reader.read(dir);

    expect(data.competitions.map((c) => c.name)).toEqual(['A', 'B']);
  });

  it('pools the trophies section across files', async () => {
    write(
      'a.json5',
      `{ trophies: [{ name: 'Chaos Cup', recipientKind: 'team',
         externalIds: [{ system: 'Name', id: 'name:chaos-cup' }] }] }`,
    );
    write(
      'b.json5',
      `{ trophies: [{ name: 'Season MVP', recipientKind: 'player',
         externalIds: [{ system: 'Name', id: 'name:season-mvp' }] }] }`,
    );

    const data = await reader.read(dir);

    expect(data.trophies).toHaveLength(2);
    expect(data.trophies.map((t) => t.name)).toEqual([
      'Chaos Cup',
      'Season MVP',
    ]);
  });

  it('pools the competitionGroups section across files', async () => {
    write(
      'a.json5',
      `{ competitionGroups: [{ name: 'Major Season',
         league: { system: 'Name', id: 'name:major' } }] }`,
    );
    write(
      'b.json5',
      `{ competitionGroups: [{ name: 'Korpen',
         league: { system: 'Name', id: 'name:korpen' } }] }`,
    );

    const data = await reader.read(dir);

    expect(data.competitionGroups).toHaveLength(2);
    expect(data.competitionGroups.map((g) => g.name)).toEqual([
      'Major Season',
      'Korpen',
    ]);
  });
});
