import { ProcessRunnerService } from '@blood-bowl-tracker/cli-shared';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { BackupAlertIssuesService } from './backup-alert-issues.service';

const GH_TIMEOUT_MS = 60_000;

/** One `gh` invocation's result. */
function ghResult(stdout: string, exitCode = 0, stderr = '') {
  return { exitCode, stdout, stderr };
}

describe('BackupAlertIssuesService', () => {
  let service: BackupAlertIssuesService;
  let processRunner: MockProxy<ProcessRunnerService>;

  beforeEach(async () => {
    processRunner = mock<ProcessRunnerService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        BackupAlertIssuesService,
        { provide: ProcessRunnerService, useValue: processRunner },
      ],
    }).compile();
    service = moduleRef.get(BackupAlertIssuesService);
  });

  describe('findOpen', () => {
    it('keeps only open backup-alert issues with exactly the title, oldest first', async () => {
      processRunner.run.mockResolvedValue(
        ghResult(
          JSON.stringify([
            { number: 12, title: 'Production backup failed' },
            { number: 9, title: 'Production backup failed' },
            { number: 10, title: 'Production backup verification failed' },
            { number: 11, title: 'Production backup failed again' },
          ]),
        ),
      );

      await expect(
        service.findOpen('Production backup failed'),
      ).resolves.toEqual([
        { number: 9, title: 'Production backup failed' },
        { number: 12, title: 'Production backup failed' },
      ]);
      expect(processRunner.run).toHaveBeenCalledWith(
        'gh',
        [
          'issue',
          'list',
          '--state',
          'open',
          '--label',
          'backup-alert',
          '--json',
          'number,title',
          '--limit',
          '100',
        ],
        GH_TIMEOUT_MS,
      );
    });

    it('returns an empty list when nothing is open', async () => {
      processRunner.run.mockResolvedValue(ghResult('[]\n'));

      await expect(
        service.findOpen('Production backup failed'),
      ).resolves.toEqual([]);
    });

    it('rejects output that is not JSON', async () => {
      processRunner.run.mockResolvedValue(ghResult('oops'));

      await expect(service.findOpen('x')).rejects.toThrow(
        "gh issue list printed unexpected output: 'oops'",
      );
    });

    it('rejects JSON of the wrong shape', async () => {
      processRunner.run.mockResolvedValue(ghResult('[{"number":"x"}]'));

      await expect(service.findOpen('x')).rejects.toThrow(/unexpected output/);
    });

    it('surfaces gh stderr when the lookup fails', async () => {
      processRunner.run.mockResolvedValue(
        ghResult('', 1, 'HTTP 401: Bad credentials\n'),
      );

      await expect(service.findOpen('x')).rejects.toThrow(
        'gh issue list failed (exit 1): HTTP 401: Bad credentials',
      );
    });
  });

  it('creates or updates the backup-alert label', async () => {
    processRunner.run.mockResolvedValue(ghResult(''));

    await service.ensureLabel();

    expect(processRunner.run).toHaveBeenCalledWith(
      'gh',
      [
        'label',
        'create',
        'backup-alert',
        '--color',
        'B60205',
        '--description',
        'A production backup check failed',
        '--force',
      ],
      GH_TIMEOUT_MS,
    );
  });

  it('surfaces a failing label update', async () => {
    processRunner.run.mockResolvedValue(ghResult('', 1, 'HTTP 403\n'));

    await expect(service.ensureLabel()).rejects.toThrow(
      'gh label create failed (exit 1): HTTP 403',
    );
  });

  it('creates an issue labeled bug and backup-alert and returns its url', async () => {
    processRunner.run.mockResolvedValue(
      ghResult('https://github.com/spacejens/blood-bowl-tracker/issues/77\n'),
    );

    await expect(
      service.create({ title: 'Production backup failed', body: 'Body' }),
    ).resolves.toBe(
      'https://github.com/spacejens/blood-bowl-tracker/issues/77',
    );
    expect(processRunner.run).toHaveBeenCalledWith(
      'gh',
      [
        'issue',
        'create',
        '--title',
        'Production backup failed',
        '--body',
        'Body',
        '--label',
        'bug',
        '--label',
        'backup-alert',
      ],
      GH_TIMEOUT_MS,
    );
  });

  it('surfaces a failing create', async () => {
    processRunner.run.mockResolvedValue(ghResult('', 1, 'boom\n'));

    await expect(service.create({ title: 't', body: 'b' })).rejects.toThrow(
      'gh issue create failed (exit 1): boom',
    );
  });

  it('comments on an issue', async () => {
    processRunner.run.mockResolvedValue(ghResult(''));

    await service.comment(9, 'Failed again');

    expect(processRunner.run).toHaveBeenCalledWith(
      'gh',
      ['issue', 'comment', '9', '--body', 'Failed again'],
      GH_TIMEOUT_MS,
    );
  });

  it('closes an issue with a comment', async () => {
    processRunner.run.mockResolvedValue(ghResult(''));

    await service.close(9, 'Resolved');

    expect(processRunner.run).toHaveBeenCalledWith(
      'gh',
      ['issue', 'close', '9', '--comment', 'Resolved'],
      GH_TIMEOUT_MS,
    );
  });

  it('surfaces a failing close', async () => {
    processRunner.run.mockResolvedValue(ghResult('', 1, 'not found\n'));

    await expect(service.close(9, 'Resolved')).rejects.toThrow(
      'gh issue close failed (exit 1): not found',
    );
  });
});
