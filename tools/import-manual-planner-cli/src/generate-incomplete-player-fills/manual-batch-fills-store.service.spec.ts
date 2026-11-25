import { join } from 'node:path';

import { GitRootsService } from '@blood-bowl-tracker/cli-shared';
import { ManualBatchLayoutService } from '@blood-bowl-tracker/manual-batch';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import {
  MANUAL_BATCHES_DIR,
  ManualBatchFillsStoreService,
} from './manual-batch-fills-store.service';

const ROOT = '/checkout';
const DIR = join(ROOT, MANUAL_BATCHES_DIR);

function fillEntry(id: string, system = 'tourplay.net'): unknown {
  return {
    player: { system, id },
    status: 'retired',
    characteristics: { ma: 6, st: 3, ag: 3, av: 9 },
    sppTotal: 0,
    unspentSpp: 0,
    startingSkills: [],
    advancements: [],
  };
}

function fills(...ids: string[]): unknown {
  return { incompletePlayerFills: ids.map((id) => fillEntry(id)) };
}

function batch(name: string): { name: string; number: number; dir: string } {
  return { name, number: Number(name.slice(0, 3)), dir: join(DIR, name) };
}

describe('ManualBatchFillsStoreService', () => {
  let service: ManualBatchFillsStoreService;
  let gitRoots: MockProxy<GitRootsService>;
  let layout: MockProxy<ManualBatchLayoutService>;

  beforeEach(async () => {
    gitRoots = mock<GitRootsService>();
    gitRoots.resolve.mockResolvedValue({
      mainRoot: ROOT,
      worktreeRoot: ROOT,
      isWorktree: false,
    });
    layout = mock<ManualBatchLayoutService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ManualBatchFillsStoreService,
        { provide: GitRootsService, useValue: gitRoots },
        { provide: ManualBatchLayoutService, useValue: layout },
      ],
    }).compile();
    service = moduleRef.get(ManualBatchFillsStoreService);
  });

  /** Seeds the layout: batch name to its files, each file to its parsed content. */
  function seed(batches: Record<string, Record<string, unknown>>): void {
    layout.listBatches.mockResolvedValue(Object.keys(batches).map(batch));
    layout.listJson5Files.mockImplementation((dir) =>
      Promise.resolve(Object.keys(batches[dir.slice(DIR.length + 1)])),
    );
    layout.readJson5.mockImplementation((path) => {
      const rest = path.slice(DIR.length + 1).split('/');
      return Promise.resolve(batches[rest[0]][rest[1]]);
    });
  }

  it('collects the TP ids every batch fills', async () => {
    seed({
      '007-low': { 'f.json5': fills('1', '2') },
      '008-feed': { 'f.json5': fills('3') },
    });

    expect([...(await service.filledTpIds())].sort()).toEqual(['1', '2', '3']);
    expect(layout.listBatches).toHaveBeenCalledWith(DIR);
  });

  it('reads only the batches named before the given one', async () => {
    seed({
      '007-low': { 'f.json5': fills('1') },
      '008-feed': { 'f.json5': fills('2') },
      '009-injured': { 'f.json5': fills('3') },
      '010-journeymen': { 'f.json5': fills('4') },
    });

    expect([...(await service.filledTpIds('009-injured'))].sort()).toEqual([
      '1',
      '2',
    ]);
  });

  it('ignores files without fills', async () => {
    seed({
      '001-seed': { 'skills.json5': { skills: [] } },
      '007-low': { 'f.json5': fills('5') },
    });

    expect([...(await service.filledTpIds())]).toEqual(['5']);
  });

  it('names a batch file whose fills have another shape', async () => {
    seed({
      '007-low': { 'f.json5': { incompletePlayerFills: [{ player: 5 }] } },
    });

    await expect(service.filledTpIds()).rejects.toThrow(
      /f\.json5 has no readable incompletePlayerFills/,
    );
  });

  it('names a batch file whose fill entry fails the shared schema', async () => {
    const bad = { ...(fillEntry('1') as object), characteristics: { ma: 0 } };
    seed({ '007-low': { 'f.json5': { incompletePlayerFills: [bad] } } });

    await expect(service.filledTpIds()).rejects.toThrow(
      new RegExp(
        `${DIR}/007-low/f\\.json5 has no readable incompletePlayerFills`,
      ),
    );
  });

  it('tells when the batches directory is missing', async () => {
    layout.listBatches.mockRejectedValue(
      Object.assign(new Error('no such dir'), { code: 'ENOENT' }),
    );

    await expect(service.filledTpIds()).rejects.toThrow(
      /import-manual\/data\/batches does not exist/,
    );
  });

  it('passes on another error reading the batches directory', async () => {
    layout.listBatches.mockRejectedValue(
      Object.assign(new Error('not a directory'), { code: 'ENOTDIR' }),
    );

    await expect(service.filledTpIds()).rejects.toThrow(/not a directory/);
  });

  it('passes on an error that is not a system error', async () => {
    layout.listBatches.mockRejectedValue('boom');

    await expect(service.filledTpIds()).rejects.toBe('boom');
  });

  it('resolves the checkout root once', async () => {
    seed({ '007-low': { 'f.json5': fills('1') } });
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
