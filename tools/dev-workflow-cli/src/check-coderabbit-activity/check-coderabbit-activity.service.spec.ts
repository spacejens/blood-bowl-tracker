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

  /** The JSON object the jq program prints. */
  function printed(hasActivity: boolean, noReviewSeat: boolean) {
    return ghResult(JSON.stringify({ hasActivity, noReviewSeat }) + '\n');
  }

  it('reports activity without a seat problem', async () => {
    processRunner.run.mockResolvedValue(printed(true, false));

    await expect(service.run('634')).resolves.toEqual({
      hasActivity: true,
      noReviewSeat: false,
    });
  });

  it('reports no activity when CodeRabbit never engaged', async () => {
    processRunner.run.mockResolvedValue(printed(false, false));

    await expect(service.run('634')).resolves.toEqual({
      hasActivity: false,
      noReviewSeat: false,
    });
  });

  it('reports the missing review seat notice', async () => {
    processRunner.run.mockResolvedValue(printed(true, true));

    await expect(service.run('1459')).resolves.toEqual({
      hasActivity: true,
      noReviewSeat: true,
    });
  });

  it('tolerates surrounding whitespace in the printed output', async () => {
    processRunner.run.mockResolvedValue(
      ghResult('  {"hasActivity":true,"noReviewSeat":false}  \n'),
    );

    await expect(service.run('634')).resolves.toEqual({
      hasActivity: true,
      noReviewSeat: false,
    });
  });

  it('asks gh for comments and reviews, matching the login case-insensitively', async () => {
    processRunner.run.mockResolvedValue(printed(false, false));

    await service.run('634');

    expect(processRunner.run).toHaveBeenCalledTimes(1);
    const args = processRunner.run.mock.calls[0]?.[1];
    expect(args?.slice(0, 5)).toEqual([
      'pr',
      'view',
      '634',
      '--json',
      'comments,reviews',
    ]);
    const jq = args?.[6];
    expect(jq).toContain('test("coderabbit"; "i")');
    expect(jq).toContain('without an assigned coderabbit review seat');
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
    processRunner.run.mockResolvedValue(ghResult('true\n'));

    await expect(service.run('634')).rejects.toThrow('unexpected output');
  });

  it('throws when a field is missing or mistyped', async () => {
    processRunner.run.mockResolvedValue(
      ghResult('{"hasActivity":true,"noReviewSeat":"yes"}\n'),
    );

    await expect(service.run('634')).rejects.toThrow('unexpected output');
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
