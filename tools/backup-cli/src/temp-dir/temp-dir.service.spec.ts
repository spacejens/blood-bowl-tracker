import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TempDirService } from './temp-dir.service';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, rmSync: vi.fn(actual.rmSync) };
});

describe('TempDirService', () => {
  let service: TempDirService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [TempDirService],
    }).compile();
    service = moduleRef.get(TempDirService);
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
    vi.mocked(rmSync).mockImplementationOnce(() => {
      throw new Error('EBUSY');
    });
    const stderr = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);

    await expect(
      service.run('backup-cli-test-', (dir) => {
        seen = dir;
        return Promise.reject(new Error('pg_restore failed'));
      }),
    ).rejects.toThrow('pg_restore failed');
    const written = stderr.mock.calls.map((call) => String(call[0])).join('');
    stderr.mockRestore();
    // The mocked removal failed, so remove the leftover directory here.
    rmSync(seen, { recursive: true, force: true });
    expect(written).toBe(
      `Warning: Could not remove temporary directory ${seen}; delete it manually.\n`,
    );
  });

  it('still returns the result when the directory cannot be removed after success', async () => {
    let seen = '';
    vi.mocked(rmSync).mockImplementationOnce(() => {
      throw new Error('EBUSY');
    });
    const stderr = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);

    const result = await service.run('backup-cli-test-', (dir) => {
      seen = dir;
      return Promise.resolve('ok');
    });
    stderr.mockRestore();
    rmSync(seen, { recursive: true, force: true });

    expect(result).toBe('ok');
  });
});
