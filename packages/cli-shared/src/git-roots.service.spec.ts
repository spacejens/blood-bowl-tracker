import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { GitRootsService } from './git-roots.service';
import { ProcessRunnerService } from './process-runner.service';

describe('GitRootsService', () => {
  let service: GitRootsService;
  let processRunner: MockProxy<ProcessRunnerService>;

  beforeEach(async () => {
    processRunner = mock<ProcessRunnerService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        GitRootsService,
        { provide: ProcessRunnerService, useValue: processRunner },
      ],
    }).compile();
    service = moduleRef.get(GitRootsService);
  });

  it('reports a worktree when the common dir parent differs from the top level', async () => {
    // `--git-common-dir` resolves to the MAIN checkout's .git directory even
    // from inside a worktree, so its parent is the main checkout root, while
    // `--show-toplevel` gives the worktree's own root.
    processRunner.run.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '/repo/.git\n',
      stderr: '',
    });
    processRunner.run.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '/repo/.claude/worktrees/feature\n',
      stderr: '',
    });

    await expect(service.resolve()).resolves.toEqual({
      mainRoot: '/repo',
      worktreeRoot: '/repo/.claude/worktrees/feature',
      isWorktree: true,
    });
  });

  it('reports no worktree when both resolve to the same root', async () => {
    processRunner.run.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '/repo/.git\n',
      stderr: '',
    });
    processRunner.run.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '/repo\n',
      stderr: '',
    });

    await expect(service.resolve()).resolves.toEqual({
      mainRoot: '/repo',
      worktreeRoot: '/repo',
      isWorktree: false,
    });
  });

  it('asks git for the absolute common dir and the top level, in that order', async () => {
    processRunner.run.mockResolvedValue({
      exitCode: 0,
      stdout: '/repo\n',
      stderr: '',
    });

    await service.resolve();

    expect(processRunner.run).toHaveBeenNthCalledWith(1, 'git', [
      'rev-parse',
      '--path-format=absolute',
      '--git-common-dir',
    ]);
    expect(processRunner.run).toHaveBeenNthCalledWith(2, 'git', [
      'rev-parse',
      '--show-toplevel',
    ]);
  });

  it('throws when git fails, including git stderr in the message', async () => {
    processRunner.run.mockResolvedValueOnce({
      exitCode: 128,
      stdout: '',
      stderr: 'fatal: not a git repository\n',
    });

    await expect(service.resolve()).rejects.toThrow(
      'fatal: not a git repository',
    );
  });
});
