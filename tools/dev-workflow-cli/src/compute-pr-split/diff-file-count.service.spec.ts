import { ProcessRunnerService } from '@blood-bowl-tracker/cli-shared';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { DiffFileCountService } from './diff-file-count.service';

describe('DiffFileCountService', () => {
  let service: DiffFileCountService;
  let processRunner: MockProxy<ProcessRunnerService>;

  beforeEach(async () => {
    processRunner = mock<ProcessRunnerService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        DiffFileCountService,
        { provide: ProcessRunnerService, useValue: processRunner },
      ],
    }).compile();
    service = moduleRef.get(DiffFileCountService);
  });

  it('counts the printed paths, excluding the lockfile by pathspec', async () => {
    processRunner.run.mockResolvedValue({
      exitCode: 0,
      stdout: 'a.ts\nb.ts\nc.ts\n',
      stderr: '',
    });

    await expect(service.count('origin/main', 'abc1234')).resolves.toBe(3);
    expect(processRunner.run).toHaveBeenCalledWith('git', [
      'diff',
      '--name-only',
      'origin/main...abc1234',
      '--',
      ':(top)',
      ':(top,exclude)pnpm-lock.yaml',
    ]);
  });

  it('counts an empty diff as zero', async () => {
    processRunner.run.mockResolvedValue({
      exitCode: 0,
      stdout: '\n',
      stderr: '',
    });

    await expect(service.count('abc1234', 'def5678')).resolves.toBe(0);
  });

  it('throws with git stderr when the diff fails', async () => {
    processRunner.run.mockResolvedValue({
      exitCode: 128,
      stdout: '',
      stderr: "fatal: bad revision 'nope'\n",
    });

    await expect(service.count('nope', 'HEAD')).rejects.toThrow(
      "git diff nope...HEAD failed (exit 128): fatal: bad revision 'nope'",
    );
  });
});
