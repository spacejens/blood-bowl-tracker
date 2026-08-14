import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
});
