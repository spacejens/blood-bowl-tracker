import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { GitRootsService } from '../shared/git-roots.service';
import { WriteFileService } from './write-file.service';

describe('WriteFileService', () => {
  let service: WriteFileService;
  let gitRoots: MockProxy<GitRootsService>;
  let fixture: string;
  let mainRoot: string;
  let worktreeRoot: string;

  beforeEach(async () => {
    fixture = mkdtempSync(join(tmpdir(), 'write-file-'));
    mainRoot = join(fixture, 'main');
    worktreeRoot = join(fixture, 'worktree');
    mkdirSync(mainRoot, { recursive: true });
    mkdirSync(worktreeRoot, { recursive: true });

    gitRoots = mock<GitRootsService>();
    gitRoots.resolve.mockResolvedValue({
      mainRoot,
      worktreeRoot,
      isWorktree: true,
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        WriteFileService,
        { provide: GitRootsService, useValue: gitRoots },
      ],
    }).compile();
    service = moduleRef.get(WriteFileService);
  });

  afterEach(() => {
    rmSync(fixture, { recursive: true, force: true });
  });

  it('writes through a symlinked parent directory to the symlink target', async () => {
    mkdirSync(join(mainRoot, 'docs/plans'), { recursive: true });
    mkdirSync(join(worktreeRoot, 'docs'), { recursive: true });
    symlinkSync(join(mainRoot, 'docs/plans'), join(worktreeRoot, 'docs/plans'));

    const result = await service.run('docs/plans/spec.md', '# spec\n');

    expect(result).toEqual({ written: 'docs/plans/spec.md', bytes: 7 });
    expect(readFileSync(join(mainRoot, 'docs/plans/spec.md'), 'utf8')).toBe(
      '# spec\n',
    );
    expect(lstatSync(join(worktreeRoot, 'docs/plans')).isSymbolicLink()).toBe(
      true,
    );
  });

  it('writes a plain file inside the worktree', async () => {
    const result = await service.run('notes.md', 'hello');

    expect(result).toEqual({ written: 'notes.md', bytes: 5 });
    expect(readFileSync(join(worktreeRoot, 'notes.md'), 'utf8')).toBe('hello');
  });

  it('creates missing intermediate parent directories', async () => {
    await service.run('docs/deep/nested/file.md', 'x');

    expect(
      readFileSync(join(worktreeRoot, 'docs/deep/nested/file.md'), 'utf8'),
    ).toBe('x');
  });

  it('overwrites an existing file', async () => {
    writeFileSync(join(worktreeRoot, 'notes.md'), 'old', 'utf8');

    await service.run('notes.md', 'new');

    expect(readFileSync(join(worktreeRoot, 'notes.md'), 'utf8')).toBe('new');
  });

  it('counts bytes as UTF-8, not characters', async () => {
    const result = await service.run('notes.md', 'é');

    expect(result.bytes).toBe(2);
  });

  it('rejects an absolute path', async () => {
    await expect(
      service.run(join(worktreeRoot, 'notes.md'), 'x'),
    ).rejects.toThrow(/absolute/i);
  });

  it('rejects a path containing a .. segment', async () => {
    await expect(service.run('docs/../../escape.md', 'x')).rejects.toThrow(
      /\.\./,
    );
    expect(existsSync(join(fixture, 'escape.md'))).toBe(false);
  });

  it('rejects an empty path', async () => {
    await expect(service.run('', 'x')).rejects.toThrow(/path/i);
  });

  it('rejects empty content without writing a file', async () => {
    await expect(service.run('notes.md', '')).rejects.toThrow(/content|empty/i);
    expect(existsSync(join(worktreeRoot, 'notes.md'))).toBe(false);
  });

  it('rejects whitespace-only content without writing a file', async () => {
    await expect(service.run('notes.md', '   \n\t ')).rejects.toThrow(
      /content|empty/i,
    );
    expect(existsSync(join(worktreeRoot, 'notes.md'))).toBe(false);
  });

  it('rejects a path whose resolved parent escapes both roots', async () => {
    const outside = join(fixture, 'outside');
    mkdirSync(outside, { recursive: true });
    symlinkSync(outside, join(worktreeRoot, 'escape'));

    await expect(service.run('escape/file.md', 'x')).rejects.toThrow(
      /outside/i,
    );
    expect(existsSync(join(outside, 'file.md'))).toBe(false);
  });

  it('rejects a multi-segment path escaping both roots without creating any directory outside the repo', async () => {
    const outside = join(fixture, 'outside');
    mkdirSync(outside, { recursive: true });
    symlinkSync(outside, join(worktreeRoot, 'escape'));

    await expect(service.run('escape/newdir/file.md', 'x')).rejects.toThrow(
      /outside/i,
    );
    expect(existsSync(join(outside, 'newdir'))).toBe(false);
    expect(existsSync(join(outside, 'newdir', 'file.md'))).toBe(false);
  });
});
