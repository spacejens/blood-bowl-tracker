import { Test } from '@nestjs/testing';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FileSystemService } from './file-system.service';

interface FsMocks {
  existsSync: Mock<(path: string) => boolean>;
  mkdirSync: Mock<(path: string, options: { recursive: boolean }) => void>;
  writeFileSync: Mock<(path: string, data: string) => void>;
}

// node:fs is replaced by thin wrappers delegating to the current test's set of
// mocks, installed fresh in beforeEach, so no mock state or implementation
// carries over from one test to the next.
const fs = vi.hoisted(() => {
  const state: { current?: FsMocks } = {};
  return {
    state,
    get: (): FsMocks => {
      if (!state.current) {
        throw new Error('node:fs mocks were not installed for this test');
      }
      return state.current;
    },
  };
});

vi.mock('node:fs', () => ({
  existsSync: (path: string): boolean => fs.get().existsSync(path),
  mkdirSync: (path: string, options: { recursive: boolean }): void => {
    fs.get().mkdirSync(path, options);
  },
  writeFileSync: (path: string, data: string): void => {
    fs.get().writeFileSync(path, data);
  },
}));

describe('FileSystemService', () => {
  let service: FileSystemService;
  let fsMocks: FsMocks;

  beforeEach(async () => {
    fsMocks = {
      existsSync: vi.fn(),
      mkdirSync: vi.fn(),
      writeFileSync: vi.fn(),
    };
    fs.state.current = fsMocks;
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [FileSystemService],
    }).compile();
    service = moduleRef.get(FileSystemService);
  });

  afterEach(() => {
    fs.state.current = undefined;
    // Only undoes the console.log spy (vi.spyOn on a real global), so the
    // next test's vi.spyOn creates a fresh spy instead of reusing this one.
    vi.restoreAllMocks();
  });

  it('creates a missing directory under the fixed data output dir', () => {
    fsMocks.existsSync.mockReturnValue(false);

    service.mkdir('season-30');

    expect(fsMocks.mkdirSync).toHaveBeenCalledWith('data/season-30', {
      recursive: true,
    });
  });

  it('does not recreate a directory that already exists', () => {
    fsMocks.existsSync.mockReturnValue(true);

    service.mkdir('season-30');

    expect(fsMocks.existsSync).toHaveBeenCalledWith('data/season-30');
    expect(fsMocks.mkdirSync).not.toHaveBeenCalled();
  });

  it('writes pretty-printed JSON, flattening slashes in the file name', () => {
    service.writeJsonFile('season-30', 'phases?type=COACH/x', { a: 1 });

    expect(fsMocks.writeFileSync).toHaveBeenCalledWith(
      'data/season-30/phases?type=COACH_x.json',
      JSON.stringify({ a: 1 }, null, 2),
    );
  });
});
