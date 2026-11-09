import { spawnSync } from 'node:child_process';

import { ProcessRunnerService } from '@blood-bowl-tracker/cli-shared';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import {
  CaptureCoderabbitCommentOptions,
  CaptureCoderabbitCommentResult,
  CaptureCoderabbitCommentService,
  CODERABBIT_COMMENTS_JQ,
} from './capture-coderabbit-comment.service';
import { CoderabbitCommentLayoutService } from './coderabbit-comment-layout.service';

interface Comment {
  readonly id: number;
  readonly updatedAt: string;
  readonly body: string;
}

const IN_PROGRESS: Comment = {
  id: 101,
  updatedAt: '2026-11-09T10:00:00Z',
  body:
    '<!-- recent_review_status_start -->\n\nCurrently processing new changes in this PR.\n\n' +
    '<!-- recent_review_status_end -->\n',
};
const DONE: Comment = {
  id: 101,
  updatedAt: '2026-11-09T10:05:00Z',
  body:
    '<!-- recent_review_status_start -->\n\nNo actionable comments were generated in the recent review.\n\n' +
    '<!-- recent_review_status_end -->\n<!-- recent_review_start -->\nrange\n<!-- recent_review_end -->\n',
};

function ghLines(comments: readonly Comment[]) {
  return {
    exitCode: 0,
    stdout:
      comments.map((comment) => JSON.stringify(comment)).join('\n') + '\n',
    stderr: '',
  };
}

const LATE: Comment = {
  id: 101,
  updatedAt: '2026-11-09T10:09:00Z',
  body:
    DONE.body +
    '<!-- recent_review_start -->\nlate verdict\n<!-- recent_review_end -->\n',
};

const GH_FAILED = { exitCode: 1, stdout: '', stderr: 'HTTP 502' };

describe('CaptureCoderabbitCommentService', () => {
  let service: CaptureCoderabbitCommentService;
  let processRunner: MockProxy<ProcessRunnerService>;

  beforeEach(async () => {
    vi.useFakeTimers();
    processRunner = mock<ProcessRunnerService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CaptureCoderabbitCommentService,
        CoderabbitCommentLayoutService,
        { provide: ProcessRunnerService, useValue: processRunner },
      ],
    }).compile();
    service = moduleRef.get(CaptureCoderabbitCommentService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function runCapture(
    options: CaptureCoderabbitCommentOptions,
    advanceMs = 60 * 60 * 1000,
  ): Promise<CaptureCoderabbitCommentResult> {
    const pending = service.run(options);
    await vi.advanceTimersByTimeAsync(advanceMs);
    return pending;
  }

  it('asks gh for every page of the PR comments, filtered to CodeRabbit', async () => {
    processRunner.run.mockResolvedValue(ghLines([DONE]));

    await runCapture({ prNumber: '1350', timeoutMs: 1000, intervalMs: 1000 });

    expect(processRunner.run).toHaveBeenCalledWith(
      'gh',
      [
        'api',
        'repos/{owner}/{repo}/issues/1350/comments',
        '--paginate',
        '--jq',
        CODERABBIT_COMMENTS_JQ,
      ],
      60_000,
    );
  });

  it('records each distinct body once, in order, and stops once the banner is gone', async () => {
    processRunner.run
      .mockResolvedValueOnce(ghLines([IN_PROGRESS]))
      .mockResolvedValueOnce(ghLines([IN_PROGRESS]))
      .mockResolvedValueOnce(ghLines([DONE]))
      .mockResolvedValue(ghLines([DONE]));

    const result = await runCapture({
      prNumber: '1350',
      intervalMs: 5000,
      settleMs: 5000,
    });

    expect(processRunner.run).toHaveBeenCalledTimes(4);
    expect(result).toMatchObject({
      prNumber: '1350',
      sawInProgress: true,
      leftInProgress: true,
      timedOut: false,
      failedPolls: 0,
    });
    expect(result.observations.map((o) => o.body)).toEqual([
      IN_PROGRESS.body,
      DONE.body,
    ]);
    expect(result.observations[0]).toMatchObject({
      commentId: 101,
      updatedAt: IN_PROGRESS.updatedAt,
    });
    expect(result.observations[0].layout.processingBanner).toBe(true);
    expect(result.observations[1].layout.statusBlockVerdict).toBe(true);
    expect(typeof result.observations[0].observedAt).toBe('string');
  });

  it('records the same body under two comment ids as two observations', async () => {
    processRunner.run.mockResolvedValue(ghLines([DONE, { ...DONE, id: 202 }]));

    const result = await runCapture({
      prNumber: '1350',
      timeoutMs: 1000,
      intervalMs: 1000,
    });

    expect(result.observations.map((o) => o.commentId)).toEqual([101, 202]);
  });

  it('times out without ever seeing the in-progress state', async () => {
    processRunner.run.mockResolvedValue(ghLines([DONE]));

    const result = await runCapture({
      prNumber: '1350',
      timeoutMs: 30_000,
      intervalMs: 10_000,
    });

    expect(result).toMatchObject({
      sawInProgress: false,
      leftInProgress: false,
      timedOut: true,
    });
    expect(result.observations).toHaveLength(1);
  });

  it('times out when the banner never goes away', async () => {
    processRunner.run.mockResolvedValue(ghLines([IN_PROGRESS]));

    const result = await runCapture({
      prNumber: '1350',
      timeoutMs: 30_000,
      intervalMs: 10_000,
    });

    expect(result).toMatchObject({
      sawInProgress: true,
      leftInProgress: false,
      timedOut: true,
    });
  });

  it('counts a failed gh call and does not treat it as leaving the in-progress state', async () => {
    processRunner.run
      .mockResolvedValueOnce(ghLines([IN_PROGRESS]))
      .mockResolvedValueOnce(GH_FAILED)
      .mockResolvedValueOnce(ghLines([DONE]))
      .mockResolvedValue(ghLines([DONE]));

    const result = await runCapture({
      prNumber: '1350',
      intervalMs: 1000,
      settleMs: 1000,
    });

    expect(processRunner.run).toHaveBeenCalledTimes(4);
    expect(result).toMatchObject({ failedPolls: 1, leftInProgress: true });
    expect(result.observations).toHaveLength(2);
  });

  it('counts a rejected process runner call as a failed poll and keeps earlier observations', async () => {
    processRunner.run
      .mockResolvedValueOnce(ghLines([IN_PROGRESS]))
      .mockRejectedValueOnce(new Error('spawn EAGAIN'))
      .mockResolvedValue(ghLines([DONE]));

    const result = await runCapture({
      prNumber: '1350',
      intervalMs: 1000,
      settleMs: 1000,
    });

    expect(result).toMatchObject({ failedPolls: 1, leftInProgress: true });
    expect(result.observations.map((o) => o.body)).toEqual([
      IN_PROGRESS.body,
      DONE.body,
    ]);
  });

  it('counts a line that is not a CodeRabbit comment object as a failed poll and keeps going', async () => {
    processRunner.run
      .mockResolvedValueOnce(ghLines([IN_PROGRESS]))
      .mockResolvedValueOnce({
        exitCode: 0,
        stdout: '{"id":"not-a-number"}\n',
        stderr: '',
      })
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'not json\n', stderr: '' })
      .mockResolvedValue(ghLines([DONE]));

    const result = await runCapture({
      prNumber: '1350',
      intervalMs: 1000,
      settleMs: 1000,
    });

    expect(result).toMatchObject({ failedPolls: 2, leftInProgress: true });
    expect(result.observations.map((o) => o.body)).toEqual([
      IN_PROGRESS.body,
      DONE.body,
    ]);
  });

  it('captures a body written after the banner was removed, within the settle window', async () => {
    processRunner.run
      .mockResolvedValueOnce(ghLines([IN_PROGRESS]))
      .mockResolvedValueOnce(ghLines([DONE]))
      .mockResolvedValueOnce(ghLines([LATE]))
      .mockResolvedValue(ghLines([LATE]));

    const result = await runCapture({
      prNumber: '1350',
      intervalMs: 1000,
      settleMs: 2000,
    });

    expect(result).toMatchObject({ leftInProgress: true, timedOut: false });
    expect(result.observations.map((o) => o.body)).toEqual([
      IN_PROGRESS.body,
      DONE.body,
      LATE.body,
    ]);
    expect(processRunner.run).toHaveBeenCalledTimes(4);
  });

  it('restarts the settle window when the banner reappears', async () => {
    processRunner.run
      .mockResolvedValueOnce(ghLines([IN_PROGRESS]))
      .mockResolvedValueOnce(ghLines([DONE]))
      .mockResolvedValueOnce(ghLines([IN_PROGRESS]))
      .mockResolvedValue(ghLines([DONE]));

    const result = await runCapture({
      prNumber: '1350',
      intervalMs: 1000,
      settleMs: 2000,
    });

    // IN, DONE (settle starts), IN (reset), DONE (settle restarts), DONE, DONE (2s elapsed)
    expect(processRunner.run).toHaveBeenCalledTimes(6);
    expect(result.leftInProgress).toBe(true);
  });

  it('settles for 30 seconds by default', async () => {
    processRunner.run
      .mockResolvedValueOnce(ghLines([IN_PROGRESS]))
      .mockResolvedValue(ghLines([DONE]));

    await runCapture({ prNumber: '1350', intervalMs: 10_000 });

    // IN at 0, DONE at 10s starts settling, done at 40s: 5 polls.
    expect(processRunner.run).toHaveBeenCalledTimes(5);
  });

  it('keeps polling after the banner is gone until the settle window elapses', async () => {
    processRunner.run
      .mockResolvedValueOnce(ghLines([IN_PROGRESS]))
      .mockResolvedValue(ghLines([DONE]));

    const pending = service.run({
      prNumber: '1350',
      intervalMs: 1000,
      settleMs: 3000,
    });
    await vi.advanceTimersByTimeAsync(3000);
    expect(processRunner.run).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(1000);
    expect(processRunner.run).toHaveBeenCalledTimes(5);
    await expect(pending).resolves.toMatchObject({
      leftInProgress: true,
      timedOut: false,
    });
  });

  it('times out during the settle window, still reporting the banner as gone', async () => {
    processRunner.run
      .mockResolvedValueOnce(ghLines([IN_PROGRESS]))
      .mockResolvedValue(ghLines([DONE]));

    const result = await runCapture({
      prNumber: '1350',
      timeoutMs: 3000,
      intervalMs: 1000,
      settleMs: 60_000,
    });

    expect(result).toMatchObject({ leftInProgress: true, timedOut: true });
  });

  it('polls every ten seconds by default', async () => {
    processRunner.run.mockResolvedValue(ghLines([DONE]));

    const pending = service.run({ prNumber: '1350', timeoutMs: 25_000 });
    await vi.advanceTimersByTimeAsync(0);
    expect(processRunner.run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(9999);
    expect(processRunner.run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(processRunner.run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(processRunner.run).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(10_000);
    await pending;
    expect(processRunner.run).toHaveBeenCalledTimes(4);
  });
});

const JQ_AVAILABLE = spawnSync('jq', ['--version']).status === 0;

/**
 * Runs the real jq program, since the tests above only mock its output.
 * Skipped where `jq` is not installed.
 */
describe.skipIf(!JQ_AVAILABLE)(
  'CODERABBIT_COMMENTS_JQ against raw comments',
  () => {
    it('keeps only CodeRabbit-authored comments, tolerating a null author and body', () => {
      const comments = [
        {
          id: 1,
          user: { login: 'coderabbitai[bot]' },
          updated_at: 'T1',
          body: 'a',
        },
        { id: 2, user: { login: 'spacejens' }, updated_at: 'T2', body: 'b' },
        { id: 3, user: null, updated_at: 'T3', body: 'c' },
        {
          id: 4,
          user: { login: 'CodeRabbitAI' },
          updated_at: 'T4',
          body: null,
        },
      ];
      const result = spawnSync('jq', ['-r', CODERABBIT_COMMENTS_JQ], {
        input: JSON.stringify(comments),
        encoding: 'utf8',
      });

      expect(result.status).toBe(0);
      expect(
        result.stdout
          .trim()
          .split('\n')
          .map((line) => JSON.parse(line) as unknown),
      ).toEqual([
        { id: 1, updatedAt: 'T1', body: 'a' },
        { id: 4, updatedAt: 'T4', body: '' },
      ]);
    });
  },
);
