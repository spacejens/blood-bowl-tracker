import { existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import { Test } from '@nestjs/testing';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TempDirService } from './temp-dir.service';

type RmSync = (
  path: string,
  options?: { recursive?: boolean; force?: boolean },
) => void;

// Only rmSync is swappable; it delegates to the current test's mock,
// installed fresh in beforeEach and defaulting to the real rmSync. Every other
// node:fs export is the real implementation.
const fs = vi.hoisted(() => {
  const state: { current?: Mock<RmSync> } = {};
  return {
    state,
    get: (): Mock<RmSync> => {
      if (!state.current) {
        throw new Error('rmSync mock was not installed for this test');
      }
      return state.current;
    },
  };
});

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    rmSync: (
      path: string,
      options?: { recursive?: boolean; force?: boolean },
    ): void => {
      fs.get()(path, options);
    },
  };
});

describe('TempDirService', () => {
  let service: TempDirService;
  let rmSync: Mock<RmSync>;
  let realRmSync: RmSync;
  // Directories a test's mocked rmSync failed to remove; cleaned up after it.
  let leftovers: string[];

  beforeEach(async () => {
    const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
    realRmSync = actual.rmSync;
    rmSync = vi.fn<RmSync>((path, options) => {
      actual.rmSync(path, options);
    });
    fs.state.current = rmSync;
    leftovers = [];
    const moduleRef = await Test.createTestingModule({
      providers: [TempDirService],
    }).compile();
    service = moduleRef.get(TempDirService);
  });

  afterEach(() => {
    fs.state.current = undefined;
    // Only undoes the process.stderr.write spies (vi.spyOn on a real global).
    vi.restoreAllMocks();
    for (const dir of leftovers) {
      realRmSync(dir, { recursive: true, force: true });
    }
  });

  it('runs the work in a new prefixed directory under the OS temp dir and returns its result', async () => {
    let seen = '';

    const result = await service.run('backup-cli-test-', (dir) => {
      seen = dir;
      writeFileSync(join(dir, 'backup.dump'), 'PGDMP');
      return Promise.resolve(42);
    });

    expect(result).toBe(42);
    expect(dirname(seen)).toBe(tmpdir());
    expect(basename(seen).startsWith('backup-cli-test-')).toBe(true);
    expect(existsSync(seen)).toBe(false);
  });

  it('removes the directory when the work fails, and propagates the error', async () => {
    let seen = '';

    await expect(
      service.run('backup-cli-test-', (dir) => {
        seen = dir;
        writeFileSync(join(dir, 'backup.dump'), 'partial');
        return Promise.reject(new Error('pg_restore failed'));
      }),
    ).rejects.toThrow('pg_restore failed');
    expect(existsSync(seen)).toBe(false);
  });

  it('warns, without masking the original error, when the directory cannot be removed', async () => {
    let seen = '';
    rmSync.mockImplementationOnce(() => {
      throw new Error('EBUSY');
    });
    const stderr = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);

    await expect(
      service.run('backup-cli-test-', (dir) => {
        seen = dir;
        leftovers.push(dir);
        return Promise.reject(new Error('pg_restore failed'));
      }),
    ).rejects.toThrow('pg_restore failed');
    const written = stderr.mock.calls.map((call) => String(call[0])).join('');
    expect(written).toBe(
      `Warning: Could not remove temporary directory ${seen}; delete it manually.\n`,
    );
  });

  it('still returns the result when the directory cannot be removed after success', async () => {
    rmSync.mockImplementationOnce(() => {
      throw new Error('EBUSY');
    });
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    const result = await service.run('backup-cli-test-', (dir) => {
      leftovers.push(dir);
      return Promise.resolve('ok');
    });
    expect(result).toBe('ok');
  });
});
