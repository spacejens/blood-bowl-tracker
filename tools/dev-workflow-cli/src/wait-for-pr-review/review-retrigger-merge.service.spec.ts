import {
  ProcessResult,
  ProcessRunnerService,
} from '@blood-bowl-tracker/cli-shared';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { ReviewRetriggerMergeService } from './review-retrigger-merge.service';

const TIMEOUT_MS = 60_000;
const BEFORE_SHA = `${'a'.repeat(40)}\n`;
const AFTER_SHA = `${'b'.repeat(40)}\n`;

function ok(stdout = ''): ProcessResult {
  return { exitCode: 0, stdout, stderr: '' };
}

/** A canned answer for one git step: a process result, or a rejection. */
type Answer = ProcessResult | { readonly reject: unknown };
type Step = 'rev-parse' | 'fetch' | 'merge' | 'push' | 'abort';

describe('ReviewRetriggerMergeService', () => {
  let service: ReviewRetriggerMergeService;
  let processRunner: MockProxy<ProcessRunnerService>;

  beforeEach(async () => {
    processRunner = mock<ProcessRunnerService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReviewRetriggerMergeService,
        { provide: ProcessRunnerService, useValue: processRunner },
      ],
    }).compile();
    service = moduleRef.get(ReviewRetriggerMergeService);
  });

  /**
   * Answers each git call by its step. An overridden step always gets its
   * override; otherwise `rev-parse` answers from `heads` in call order (the
   * last entry repeats) and every other step succeeds.
   */
  function mockGit(
    answers: Partial<Record<Step, Answer>>,
    heads: readonly string[] = [BEFORE_SHA, AFTER_SHA],
  ) {
    let headIndex = 0;
    processRunner.run.mockImplementation((_command, args) => {
      const step = (
        args[0] === 'merge' && args[1] === '--abort' ? 'abort' : args[0]
      ) as Step;
      const answer = answers[step];
      if (answer !== undefined) {
        if ('reject' in answer) {
          // Non-Error rejections are deliberate: the service must cope.
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          return Promise.reject(answer.reject);
        }
        return Promise.resolve(answer);
      }
      if (step === 'rev-parse') {
        const head = heads[Math.min(headIndex, heads.length - 1)];
        headIndex += 1;
        return Promise.resolve(ok(head));
      }
      return Promise.resolve(ok());
    });
  }

  /** Every git call's arguments, joined, in call order. */
  function gitCalls(): string[] {
    return processRunner.run.mock.calls.map((call) => call[1].join(' '));
  }

  it('merges main and pushes when the merge creates a new commit', async () => {
    mockGit({});

    const result = await service.mergeMainAndPush(TIMEOUT_MS);

    expect(result).toEqual({ pushed: true });
    expect(gitCalls()).toEqual([
      'rev-parse HEAD',
      'fetch origin main',
      'merge origin/main --no-edit',
      'rev-parse HEAD',
      'push',
    ]);
    for (const [command, , timeoutMs] of processRunner.run.mock.calls) {
      expect(command).toBe('git');
      expect(timeoutMs).toBe(TIMEOUT_MS);
    }
  });

  it('does not push when the merge left HEAD unchanged', async () => {
    mockGit({}, [BEFORE_SHA, BEFORE_SHA]);

    const result = await service.mergeMainAndPush(TIMEOUT_MS);

    expect(result).toEqual({ pushed: false });
    expect(gitCalls()).not.toContain('push');
    expect(gitCalls()).not.toContain('merge --abort');
  });

  it('reports a failed fetch by its fatal line and aborts', async () => {
    mockGit({
      fetch: {
        exitCode: 128,
        stdout: '',
        stderr:
          'remote: noise\nfatal: unable to access the remote\nmore detail\n',
      },
    });

    const result = await service.mergeMainAndPush(TIMEOUT_MS);

    expect(result).toEqual({
      pushed: false,
      failure:
        'git fetch origin main failed: fatal: unable to access the remote',
    });
    expect(gitCalls()).toEqual([
      'rev-parse HEAD',
      'fetch origin main',
      'merge --abort',
    ]);
  });

  it('aborts a conflicting merge and reports its last stdout line', async () => {
    mockGit({
      merge: {
        exitCode: 1,
        stdout:
          'Auto-merging README.md\n' +
          'CONFLICT (content): Merge conflict in README.md\n' +
          'Automatic merge failed; fix conflicts and then commit the result.\n',
        stderr: '',
      },
    });

    const result = await service.mergeMainAndPush(TIMEOUT_MS);

    expect(result).toEqual({
      pushed: false,
      failure:
        'git merge origin/main --no-edit failed: Automatic merge failed; fix conflicts and then commit the result.',
    });
    expect(gitCalls()).toContain('merge --abort');
    expect(gitCalls()).not.toContain('push');
  });

  it('reports a rejected push by its error line', async () => {
    mockGit({
      push: {
        exitCode: 1,
        stdout: '',
        stderr:
          'To github.com:owner/repo.git\n' +
          ' ! [rejected]        HEAD -> branch (fetch first)\n' +
          "error: failed to push some refs to 'github.com:owner/repo.git'\n",
      },
    });

    const result = await service.mergeMainAndPush(TIMEOUT_MS);

    expect(result).toEqual({
      pushed: false,
      failure:
        "git push failed: error: failed to push some refs to 'github.com:owner/repo.git'",
    });
    expect(gitCalls().at(-1)).toBe('merge --abort');
  });

  it('falls back to the first stderr line when none is fatal or an error', async () => {
    mockGit({
      fetch: { exitCode: 1, stdout: '', stderr: 'warning: odd remote\n' },
    });

    const result = await service.mergeMainAndPush(TIMEOUT_MS);

    expect(result.failure).toBe(
      'git fetch origin main failed: warning: odd remote',
    );
  });

  it('falls back to the exit code when the step printed nothing', async () => {
    mockGit({ fetch: { exitCode: -1, stdout: '', stderr: '' } });

    const result = await service.mergeMainAndPush(TIMEOUT_MS);

    expect(result.failure).toBe('git fetch origin main failed: exit code -1');
  });

  it('reports a git process that could not be started', async () => {
    mockGit({ fetch: { reject: new Error('spawn git ENOENT') } });

    const result = await service.mergeMainAndPush(TIMEOUT_MS);

    expect(result).toEqual({
      pushed: false,
      failure: 'git fetch origin main failed: spawn git ENOENT',
    });
  });

  it('reports a non-Error rejection by its string form', async () => {
    mockGit({ 'rev-parse': { reject: 'boom' } });

    const result = await service.mergeMainAndPush(TIMEOUT_MS);

    expect(result).toEqual({
      pushed: false,
      failure: 'git rev-parse HEAD failed: boom',
    });
  });

  it('still reports the original failure when the abort itself fails', async () => {
    mockGit({
      merge: { exitCode: 1, stdout: '', stderr: 'error: merge failed\n' },
      abort: { reject: new Error('abort exploded') },
    });

    const result = await service.mergeMainAndPush(TIMEOUT_MS);

    expect(result).toEqual({
      pushed: false,
      failure: 'git merge origin/main --no-edit failed: error: merge failed',
    });
  });
});
