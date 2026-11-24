import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { GitRootsService } from '@blood-bowl-tracker/cli-shared';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import {
  MANUAL_BATCHES_DIR,
  ManualBatchFillsStoreService,
} from './manual-batch-fills-store.service';

function fills(...ids: string[]): string {
  const entries = ids
    .map((id) => `{ player: { system: 'tourplay.net', id: '${id}' } }`)
    .join(', ');
  return `// generated\n{ incompletePlayerFills: [${entries}] }\n`;
}

describe('ManualBatchFillsStoreService', () => {
  let service: ManualBatchFillsStoreService;
  let gitRoots: MockProxy<GitRootsService>;
  let root: string;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'manual-batch-fills-'));
    gitRoots = mock<GitRootsService>();
    gitRoots.resolve.mockResolvedValue({
      mainRoot: root,
      worktreeRoot: root,
      isWorktree: false,
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        ManualBatchFillsStoreService,
        { provide: GitRootsService, useValue: gitRoots },
      ],
    }).compile();
    service = moduleRef.get(ManualBatchFillsStoreService);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function put(batch: string, file: string, text: string): void {
    const dir = join(root, MANUAL_BATCHES_DIR, batch);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, file), text);
  }

  it('collects the TP ids every batch fills', async () => {
    put('007-low', 'incomplete-player-fills.json5', fills('1', '2'));
    put('008-feed', 'incomplete-player-fills.json5', fills('3'));

    expect([...(await service.filledTpIds())].sort()).toEqual(['1', '2', '3']);
  });

  it('reads only the batches named before the given one', async () => {
    put('007-low', 'f.json5', fills('1'));
    put('008-feed', 'f.json5', fills('2'));
    put('009-injured', 'f.json5', fills('3'));
    put('010-journeymen', 'f.json5', fills('4'));

    expect([...(await service.filledTpIds('009-injured'))].sort()).toEqual([
      '1',
      '2',
    ]);
  });

  it('ignores files without fills, fills of another system, and other files', async () => {
    put('001-seed', 'skills.json5', '{ skills: [] }');
    put(
      '001-seed',
      'teams.json5',
      '// incompletePlayerFills come later\n{ teams: [] }',
    );
    put(
      '007-low',
      'f.json5',
      "{ incompletePlayerFills: [{ player: { system: 'Name', id: 'Bob' } }, { player: { system: 'tourplay.net', id: '5' } }] }",
    );
    put('007-low', 'notes.txt', 'incompletePlayerFills');
    writeFileSync(join(root, MANUAL_BATCHES_DIR, 'README.md'), 'x');

    expect([...(await service.filledTpIds())]).toEqual(['5']);
  });

  it('names a batch file that is not valid JSON5', async () => {
    put('007-low', 'f.json5', '{ incompletePlayerFills: [');

    await expect(service.filledTpIds()).rejects.toThrow(
      /f\.json5 is not valid JSON5/,
    );
  });

  it('names a batch file whose fills have another shape', async () => {
    put('007-low', 'f.json5', '{ incompletePlayerFills: [{ player: 5 }] }');

    await expect(service.filledTpIds()).rejects.toThrow(
      /f\.json5 has no readable incompletePlayerFills/,
    );
  });

  it('tells when the batches directory is missing', async () => {
    await expect(service.filledTpIds()).rejects.toThrow(
      /import-manual\/data\/batches does not exist/,
    );
  });

  it('passes on another error reading the batches directory', async () => {
    mkdirSync(join(root, 'tools/import-manual/data'), { recursive: true });
    writeFileSync(join(root, MANUAL_BATCHES_DIR), 'not a directory');

    await expect(service.filledTpIds()).rejects.toThrow(/ENOTDIR/);
  });

  it('resolves the checkout root once', async () => {
    put('007-low', 'f.json5', fills('1'));
    await service.filledTpIds();
    await service.filledTpIds();

    expect(gitRoots.resolve).toHaveBeenCalledTimes(1);
  });

  describe('batchOf', () => {
    it.each([
      [
        'tools/import-manual/data/batches/017-x/incomplete-player-fills.json5',
        '017-x',
      ],
      ['./tools/import-manual/data/batches/017-x/f.json5', '017-x'],
      ['out/f.json5', undefined],
      ['tools/import-manual/data/batches', undefined],
      ['tools/import-manual/data/batches/f.json5', undefined],
    ])('places %s in batch %s', (out, batch) => {
      expect(service.batchOf(out)).toBe(batch);
    });
  });
});
