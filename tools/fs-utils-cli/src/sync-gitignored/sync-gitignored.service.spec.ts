import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { GitRootsService } from '@blood-bowl-tracker/cli-shared';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { SyncGitignoredService } from './sync-gitignored.service';

describe('SyncGitignoredService', () => {
  let service: SyncGitignoredService;
  let gitRoots: MockProxy<GitRootsService>;
  let fixture: string;
  let mainRoot: string;
  let worktreeRoot: string;

  const writeIn = (root: string, path: string, content: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content, 'utf8');
  };

  beforeEach(async () => {
    fixture = mkdtempSync(join(tmpdir(), 'sync-gitignored-'));
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
        SyncGitignoredService,
        { provide: GitRootsService, useValue: gitRoots },
      ],
    }).compile();
    service = moduleRef.get(SyncGitignoredService);
  });

  afterEach(() => {
    rmSync(fixture, { recursive: true, force: true });
  });

  it('does nothing at all outside a worktree', async () => {
    gitRoots.resolve.mockResolvedValue({
      mainRoot,
      worktreeRoot: mainRoot,
      isWorktree: false,
    });
    writeIn(mainRoot, 'apps/discord-bot/.env', 'TOKEN=main');

    await expect(service.run()).resolves.toEqual({
      copied: [],
      symlinked: [],
      skipped: [],
    });
  });

  it('copies a config file that exists in the main checkout but not the worktree', async () => {
    writeIn(mainRoot, 'apps/discord-bot/.env', 'TOKEN=main');
    mkdirSync(join(worktreeRoot, 'apps/discord-bot'), { recursive: true });

    const result = await service.run();

    expect(result.copied).toContain('apps/discord-bot/.env');
    expect(
      readFileSync(join(worktreeRoot, 'apps/discord-bot/.env'), 'utf8'),
    ).toBe('TOKEN=main');
  });

  it('never overwrites a config file already present in the worktree', async () => {
    writeIn(mainRoot, 'apps/discord-bot/.env', 'TOKEN=main');
    writeIn(worktreeRoot, 'apps/discord-bot/.env', 'TOKEN=worktree');

    const result = await service.run();

    expect(result.copied).not.toContain('apps/discord-bot/.env');
    expect(result.skipped).toContain('apps/discord-bot/.env');
    expect(
      readFileSync(join(worktreeRoot, 'apps/discord-bot/.env'), 'utf8'),
    ).toBe('TOKEN=worktree');
  });

  it('skips a config file that is missing from the main checkout too', async () => {
    const result = await service.run();

    expect(result.copied).toEqual([]);
    expect(result.skipped).toContain(
      'tools/review-match/review-match-config.json5',
    );
  });

  it('symlinks a data directory into the worktree rather than copying it', async () => {
    mkdirSync(join(mainRoot, 'tools/import-bbl/data'), { recursive: true });
    mkdirSync(join(worktreeRoot, 'tools/import-bbl'), { recursive: true });

    const result = await service.run();

    expect(result.symlinked).toContain('tools/import-bbl/data');
    const link = join(worktreeRoot, 'tools/import-bbl/data');
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(readlinkSync(link)).toBe(join(mainRoot, 'tools/import-bbl/data'));
  });

  it('never replaces a data directory entry already present in the worktree', async () => {
    mkdirSync(join(mainRoot, 'tools/import-tp/data'), { recursive: true });
    mkdirSync(join(worktreeRoot, 'tools/import-tp/data'), { recursive: true });

    const result = await service.run();

    expect(result.symlinked).not.toContain('tools/import-tp/data');
    expect(result.skipped).toContain('tools/import-tp/data');
    expect(
      lstatSync(join(worktreeRoot, 'tools/import-tp/data')).isDirectory(),
    ).toBe(true);
  });

  it('creates docs/plans in the main checkout when missing, then symlinks it', async () => {
    const result = await service.run();

    expect(result.symlinked).toContain('docs/plans');
    expect(existsSync(join(mainRoot, 'docs/plans'))).toBe(true);
    const link = join(worktreeRoot, 'docs/plans');
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(readlinkSync(link)).toBe(join(mainRoot, 'docs/plans'));
  });

  it('symlinks an existing main-checkout docs/plans without disturbing its contents', async () => {
    writeIn(mainRoot, 'docs/plans/existing-plan.md', '# existing');

    const result = await service.run();

    expect(result.symlinked).toContain('docs/plans');
    expect(
      readFileSync(join(worktreeRoot, 'docs/plans/existing-plan.md'), 'utf8'),
    ).toBe('# existing');
  });

  it('never replaces a docs/plans already present in the worktree', async () => {
    writeIn(mainRoot, 'docs/plans/main-plan.md', '# main');
    writeIn(worktreeRoot, 'docs/plans/worktree-plan.md', '# worktree');

    const result = await service.run();

    expect(result.symlinked).not.toContain('docs/plans');
    expect(result.skipped).toContain('docs/plans');
    const target = join(worktreeRoot, 'docs/plans');
    expect(lstatSync(target).isDirectory()).toBe(true);
    expect(lstatSync(target).isSymbolicLink()).toBe(false);
    expect(existsSync(join(target, 'worktree-plan.md'))).toBe(true);
    expect(existsSync(join(target, 'main-plan.md'))).toBe(false);
  });

  it('treats a dangling docs/plans symlink in the worktree as occupied rather than crashing', async () => {
    mkdirSync(join(fixture, 'gone'), { recursive: true });
    const danglingTarget = join(fixture, 'gone', 'docs-plans');
    rmSync(danglingTarget, { recursive: true, force: true });
    const link = join(worktreeRoot, 'docs/plans');
    mkdirSync(dirname(link), { recursive: true });
    symlinkSync(danglingTarget, link);

    const result = await service.run();

    expect(result.symlinked).not.toContain('docs/plans');
    expect(result.skipped).toContain('docs/plans');
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(readlinkSync(link)).toBe(danglingTarget);
  });
});
