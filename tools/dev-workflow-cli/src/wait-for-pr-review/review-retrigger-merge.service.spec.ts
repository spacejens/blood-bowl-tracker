import {
  ProcessResult,
  ProcessRunnerService,
} from '@blood-bowl-tracker/cli-shared';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
type Step =
  | 'merge-head'
  | 'rev-parse'
  | 'rev-list'
  | 'fetch'
  | 'merge'
  | 'push'
  | 'abort';

/** Which canned step a git call's arguments belong to. */
function stepOf(args: readonly string[]): Step {
  if (args[0] === 'merge' && args[1] === '--abort') {
    return 'abort';
  }
  if (args[0] === 'rev-parse' && args.includes('MERGE_HEAD')) {
    return 'merge-head';
  }
  return args[0] as Step;
}

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
   * last entry repeats), `merge-head` reports no merge in progress,
   * `rev-list` reports nothing ahead, and every other step succeeds.
   */
  function mockGit(
    answers: Partial<Record<Step, Answer>>,
    heads: readonly string[] = [BEFORE_SHA, AFTER_SHA],
  ) {
    let headIndex = 0;
    processRunner.run.mockImplementation((_command, args) => {
      const step = stepOf(args);
      const answer = answers[step];
      if (answer !== undefined) {
        if ('reject' in answer) {
          // Non-Error rejections are deliberate: the service must cope.
          // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
          return Promise.reject(answer.reject);
        }
        return Promise.resolve(answer);
      }
      if (step === 'merge-head') {
        return Promise.resolve({ exitCode: 1, stdout: '', stderr: '' });
      }
      if (step === 'rev-list') {
        return Promise.resolve(ok('0\n'));
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
      'rev-parse -q --verify MERGE_HEAD',
      'rev-parse HEAD',
      'fetch origin main',
      'merge origin/main --no-edit',
      'rev-parse HEAD',
      'push',
    ]);
    for (const [command, , timeoutMs] of processRunner.run.mock.calls) {
      expect(command).toBe('git');
      expect(timeoutMs).toBeGreaterThan(0);
      expect(timeoutMs).toBeLessThanOrEqual(TIMEOUT_MS);
    }
  });

  it('does not push when the merge left HEAD unchanged and nothing is ahead', async () => {
    mockGit({}, [BEFORE_SHA, BEFORE_SHA]);

    const result = await service.mergeMainAndPush(TIMEOUT_MS);

    expect(result).toEqual({ pushed: false });
    expect(gitCalls()).toContain('rev-list --count @{upstream}..HEAD');
    expect(gitCalls()).not.toContain('push');
    expect(gitCalls()).not.toContain('merge --abort');
  });

  it('pushes a local merge commit an earlier failed push left behind', async () => {
    mockGit({ 'rev-list': ok('1\n') }, [BEFORE_SHA, BEFORE_SHA]);

    const result = await service.mergeMainAndPush(TIMEOUT_MS);

    expect(result).toEqual({ pushed: true });
    expect(gitCalls().at(-1)).toBe('push');
  });

  it('reports a failed upstream check without pushing', async () => {
    mockGit(
      {
        'rev-list': {
          exitCode: 128,
          stdout: '',
          stderr: 'fatal: no upstream configured for branch\n',
        },
      },
      [BEFORE_SHA, BEFORE_SHA],
    );

    const result = await service.mergeMainAndPush(TIMEOUT_MS);

    expect(result.pushed).toBe(false);
    expect(result.failure).toContain('fatal: no upstream configured');
    expect(gitCalls()).not.toContain('push');
  });

  it('leaves a merge already in progress alone', async () => {
    mockGit({ 'merge-head': ok('c'.repeat(40)) });

    const result = await service.mergeMainAndPush(TIMEOUT_MS);

    expect(result).toEqual({
      pushed: false,
      failure:
        'a merge is already in progress in this worktree; left untouched',
    });
    expect(gitCalls()).toEqual(['rev-parse -q --verify MERGE_HEAD']);
  });

  it('reports a merge-state check that fails outright', async () => {
    mockGit({
      'merge-head': { exitCode: 128, stdout: '', stderr: 'fatal: not a repo' },
    });

    const result = await service.mergeMainAndPush(TIMEOUT_MS);

    expect(result.failure).toBe(
      'git rev-parse -q --verify MERGE_HEAD failed: fatal: not a repo',
    );
    expect(gitCalls()).not.toContain('merge --abort');
  });

  describe('time budget', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('gives each step only the time left of the one budget', async () => {
      mockGit({});
      const run = processRunner.run.getMockImplementation();
      processRunner.run.mockImplementation(async (command, args, timeoutMs) => {
        vi.advanceTimersByTime(1_000);
        return (await run?.(command, args, timeoutMs)) as ProcessResult;
      });

      await service.mergeMainAndPush(TIMEOUT_MS);

      const budgets = processRunner.run.mock.calls.map((call) => call[2]);
      expect(budgets).toEqual([60_000, 59_000, 58_000, 57_000, 56_000, 55_000]);
    });

    it('starts no step once the budget is spent, and aborts the merge it started', async () => {
      mockGit({});
      const run = processRunner.run.getMockImplementation();
      processRunner.run.mockImplementation(async (command, args, timeoutMs) => {
        if (args[0] === 'merge' && args[1] !== '--abort') {
          vi.advanceTimersByTime(TIMEOUT_MS);
        }
        return (await run?.(command, args, timeoutMs)) as ProcessResult;
      });

      const result = await service.mergeMainAndPush(TIMEOUT_MS);

      expect(result.failure).toBe(
        'git rev-parse HEAD not started: the time budget is spent',
      );
      expect(gitCalls().at(-1)).toBe('merge --abort');
      expect(gitCalls()).not.toContain('push');
    });
  });

  it('reports a failed fetch by its fatal line without aborting', async () => {
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
      'rev-parse -q --verify MERGE_HEAD',
      'rev-parse HEAD',
      'fetch origin main',
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
