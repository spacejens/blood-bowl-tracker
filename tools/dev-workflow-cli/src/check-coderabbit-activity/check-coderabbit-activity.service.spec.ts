import { ProcessRunnerService } from '@blood-bowl-tracker/cli-shared';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { CheckCoderabbitActivityService } from './check-coderabbit-activity.service';

describe('CheckCoderabbitActivityService', () => {
  let service: CheckCoderabbitActivityService;
  let processRunner: MockProxy<ProcessRunnerService>;

  beforeEach(async () => {
    processRunner = mock<ProcessRunnerService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CheckCoderabbitActivityService,
        { provide: ProcessRunnerService, useValue: processRunner },
      ],
    }).compile();
    service = moduleRef.get(CheckCoderabbitActivityService);
  });

  /** A `gh pr view --jq` invocation that printed the given output. */
  function ghResult(stdout: string, exitCode = 0, stderr = '') {
    return { exitCode, stdout, stderr };
  }

  it('reports activity when the jq program prints true', async () => {
    processRunner.run.mockResolvedValue(ghResult('true\n'));

    await expect(service.run('634')).resolves.toEqual({ hasActivity: true });
  });

  it('reports no activity when the jq program prints false', async () => {
    processRunner.run.mockResolvedValue(ghResult('false\n'));

    await expect(service.run('634')).resolves.toEqual({ hasActivity: false });
  });

  it('tolerates surrounding whitespace in the printed output', async () => {
    processRunner.run.mockResolvedValue(ghResult('  true  \n'));

    await expect(service.run('634')).resolves.toEqual({ hasActivity: true });
  });

  it('asks gh for both comments and reviews, matching the login case-insensitively', async () => {
    processRunner.run.mockResolvedValue(ghResult('false\n'));

    await service.run('634');

    expect(processRunner.run).toHaveBeenCalledTimes(1);
    expect(processRunner.run).toHaveBeenCalledWith('gh', [
      'pr',
      'view',
      '634',
      '--json',
      'comments,reviews',
      '--jq',
      '([(.comments[]?.author.login // ""), (.reviews[]?.author.login // "")] | ' +
        'any(test("coderabbit"; "i")))',
    ]);
  });

  it('throws with gh stderr when the lookup fails', async () => {
    processRunner.run.mockResolvedValue(
      ghResult('', 1, 'could not resolve to a PullRequest\n'),
    );

    await expect(service.run('634')).rejects.toThrow(
      'could not resolve to a PullRequest',
    );
  });

  it('throws when the output is neither true nor false', async () => {
    processRunner.run.mockResolvedValue(ghResult('null\n'));

    await expect(service.run('634')).rejects.toThrow('null');
  });

  it('throws when the output is empty', async () => {
    processRunner.run.mockResolvedValue(ghResult('\n'));

    await expect(service.run('634')).rejects.toThrow('unexpected output');
    expect(processRunner.run).toHaveBeenCalledTimes(1);
  });

  it('rejects a missing pr number without calling gh', async () => {
    await expect(service.run(undefined)).rejects.toThrow(
      'check-coderabbit-activity <pr-number>',
    );
    expect(processRunner.run).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric pr number without calling gh', async () => {
    await expect(service.run('--help')).rejects.toThrow(
      'check-coderabbit-activity <pr-number>',
    );
    expect(processRunner.run).not.toHaveBeenCalled();
  });
});
