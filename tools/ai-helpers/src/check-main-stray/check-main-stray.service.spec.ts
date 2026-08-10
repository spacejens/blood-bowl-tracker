import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { GitRootsService } from '../shared/git-roots.service';
import { ProcessRunnerService } from '../shared/process-runner.service';
import { CheckMainStrayService } from './check-main-stray.service';

describe('CheckMainStrayService', () => {
  let service: CheckMainStrayService;
  let gitRoots: MockProxy<GitRootsService>;
  let processRunner: MockProxy<ProcessRunnerService>;

  beforeEach(async () => {
    gitRoots = mock<GitRootsService>();
    processRunner = mock<ProcessRunnerService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CheckMainStrayService,
        { provide: GitRootsService, useValue: gitRoots },
        { provide: ProcessRunnerService, useValue: processRunner },
      ],
    }).compile();
    service = moduleRef.get(CheckMainStrayService);
  });

  const inWorktree = (): void => {
    gitRoots.resolve.mockResolvedValue({
      mainRoot: '/repo',
      worktreeRoot: '/repo/.claude/worktrees/feature',
      isWorktree: true,
    });
  };

  it('reports nothing and runs no git commands outside a worktree', async () => {
    gitRoots.resolve.mockResolvedValue({
      mainRoot: '/repo',
      worktreeRoot: '/repo',
      isWorktree: false,
    });

    await expect(service.run()).resolves.toEqual({ isWorktree: false });
    expect(processRunner.run).not.toHaveBeenCalled();
  });

  it('returns empty lists when the main checkout is clean', async () => {
    inWorktree();
    processRunner.run.mockResolvedValue({
      exitCode: 0,
      stdout: '',
      stderr: '',
    });

    await expect(service.run()).resolves.toEqual({
      isWorktree: true,
      uncommittedFiles: [],
      strayCommits: [],
    });
  });

  it('parses porcelain status paths and oneline commits from the main checkout', async () => {
    inWorktree();
    processRunner.run.mockResolvedValueOnce({
      exitCode: 0,
      stdout: ' M apps/discord-bot/src/main.ts\n?? notes.txt\n',
      stderr: '',
    });
    processRunner.run.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'abc1234 fix: stray commit on main\ndef5678 chore: another\n',
      stderr: '',
    });

    await expect(service.run()).resolves.toEqual({
      isWorktree: true,
      uncommittedFiles: [
        { status: ' M', path: 'apps/discord-bot/src/main.ts' },
        { status: '??', path: 'notes.txt' },
      ],
      strayCommits: [
        { sha: 'abc1234', subject: 'fix: stray commit on main' },
        { sha: 'def5678', subject: 'chore: another' },
      ],
    });
  });

  it('targets the main checkout with -C for both git calls', async () => {
    inWorktree();
    processRunner.run.mockResolvedValue({
      exitCode: 0,
      stdout: '',
      stderr: '',
    });

    await service.run();

    expect(processRunner.run).toHaveBeenNthCalledWith(1, 'git', [
      '-C',
      '/repo',
      'status',
      '--porcelain',
    ]);
    expect(processRunner.run).toHaveBeenNthCalledWith(2, 'git', [
      '-C',
      '/repo',
      'log',
      '--oneline',
      '@{u}..HEAD',
    ]);
  });

  it('treats a failing log lookup (no upstream configured) as no stray commits', async () => {
    inWorktree();
    processRunner.run.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
    });
    processRunner.run.mockResolvedValueOnce({
      exitCode: 128,
      stdout: '',
      stderr: "fatal: no upstream configured for branch 'main'\n",
    });

    await expect(service.run()).resolves.toEqual({
      isWorktree: true,
      uncommittedFiles: [],
      strayCommits: [],
    });
  });

  it('throws when the status lookup itself fails', async () => {
    inWorktree();
    processRunner.run.mockResolvedValueOnce({
      exitCode: 128,
      stdout: '',
      stderr: 'fatal: not a git repository\n',
    });

    await expect(service.run()).rejects.toThrow('fatal: not a git repository');
  });

  it('parses log lines with no subject (bare sha)', async () => {
    inWorktree();
    processRunner.run.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
    });
    processRunner.run.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'abc1234\n',
      stderr: '',
    });

    await expect(service.run()).resolves.toEqual({
      isWorktree: true,
      uncommittedFiles: [],
      strayCommits: [{ sha: 'abc1234', subject: '' }],
    });
  });
});
