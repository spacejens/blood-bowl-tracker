import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import {
  ProcessRunnerService,
  TIMED_OUT_EXIT_CODE,
} from '../shared/process-runner.service';
import { WaitForPrReviewService } from './wait-for-pr-review.service';

const REVIEW = {
  author: { login: 'coderabbitai' },
  state: 'COMMENTED',
  submittedAt: '2026-08-11T10:00:00Z',
};

/** A `gh` invocation that found nothing: jq's `first` on an empty array. */
const EMPTY = { exitCode: 0, stdout: 'null\n', stderr: '' };
/** A `gh` invocation that found a qualifying review. */
const FOUND = {
  exitCode: 0,
  stdout: `${JSON.stringify(REVIEW, null, 2)}\n`,
  stderr: '',
};

const OPTIONS = {
  prNumber: '392',
  developerLogin: 'spacejens',
  sinceEpochSeconds: 1_760_000_000,
};

describe('WaitForPrReviewService', () => {
  let service: WaitForPrReviewService;
  let processRunner: MockProxy<ProcessRunnerService>;

  beforeEach(async () => {
    vi.useFakeTimers();
    processRunner = mock<ProcessRunnerService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        WaitForPrReviewService,
        { provide: ProcessRunnerService, useValue: processRunner },
      ],
    }).compile();
    service = moduleRef.get(WaitForPrReviewService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Runs the wait to completion under fake timers: the returned promise only
   * settles once enough timer time has been advanced, so the advancing has to
   * happen while the wait is still pending rather than after an `await`.
   */
  async function runWait(
    options: Parameters<WaitForPrReviewService['run']>[0],
    advanceMs = 15 * 60 * 1000,
  ): Promise<Awaited<ReturnType<WaitForPrReviewService['run']>>> {
    const pending = service.run(options);
    await vi.advanceTimersByTimeAsync(advanceMs);
    return pending;
  }

  it('returns the parsed review found on the first poll', async () => {
    processRunner.run.mockResolvedValue(FOUND);

    const result = await runWait(OPTIONS);

    expect(result).toEqual({ found: true, review: REVIEW });
    expect(processRunner.run).toHaveBeenCalledTimes(1);
  });

  it('queries gh for non-author reviews submitted after the given instant', async () => {
    processRunner.run.mockResolvedValue(FOUND);

    await runWait(OPTIONS);

    const [command, args] = processRunner.run.mock.calls[0];
    expect(command).toBe('gh');
    expect(args.slice(0, 6)).toEqual([
      'pr',
      'view',
      '392',
      '--json',
      'reviews',
      '--jq',
    ]);
    expect(args[6]).toContain('.author.login != "spacejens"');
    expect(args[6]).toContain('fromdateiso8601) > 1760000000');
  });

  it('keeps polling on the interval until a review appears', async () => {
    processRunner.run
      .mockResolvedValueOnce(EMPTY)
      .mockResolvedValueOnce(EMPTY)
      .mockResolvedValue(FOUND);

    const result = await runWait({ ...OPTIONS, intervalMs: 30_000 });

    expect(result).toEqual({ found: true, review: REVIEW });
    expect(processRunner.run).toHaveBeenCalledTimes(3);
  });

  it('reports a timeout when no qualifying review ever appears', async () => {
    processRunner.run.mockResolvedValue(EMPTY);

    const result = await runWait({
      ...OPTIONS,
      timeoutMs: 90_000,
      intervalMs: 30_000,
    });

    expect(result).toEqual({ found: false, timedOut: true });
    // Polls at 0/30s/60s/90s: the 90s poll happens, then the deadline is hit.
    expect(processRunner.run).toHaveBeenCalledTimes(4);
  });

  it('tolerates a failing gh call and retries on the next interval', async () => {
    processRunner.run
      .mockResolvedValueOnce({
        exitCode: 1,
        stdout: '',
        stderr: 'could not resolve host',
      })
      .mockResolvedValue(FOUND);

    const result = await runWait({ ...OPTIONS, intervalMs: 30_000 });

    expect(result).toEqual({ found: true, review: REVIEW });
    expect(processRunner.run).toHaveBeenCalledTimes(2);
  });

  it('tolerates unparseable gh output and retries on the next interval', async () => {
    processRunner.run
      .mockResolvedValueOnce({ exitCode: 0, stdout: 'not json', stderr: '' })
      .mockResolvedValue(FOUND);

    const result = await runWait({ ...OPTIONS, intervalMs: 30_000 });

    expect(result).toEqual({ found: true, review: REVIEW });
    expect(processRunner.run).toHaveBeenCalledTimes(2);
  });

  it('passes the remaining time budget to each gh call, shrinking toward the deadline, floored at one interval once exhausted', async () => {
    processRunner.run.mockResolvedValue(EMPTY);

    await runWait({ ...OPTIONS, timeoutMs: 90_000, intervalMs: 30_000 });

    const budgets = processRunner.run.mock.calls.map((call) => call[2]);
    // The 4th poll's remaining budget is exactly 0 (deadline reached) —
    // execFile's `timeout: 0` means "no timeout", so it floors to
    // intervalMs instead of being left unbounded.
    expect(budgets).toEqual([90_000, 60_000, 30_000, 30_000]);
  });

  it('bounds even a zero-budget wait to one interval, never leaving the single poll unbounded', async () => {
    processRunner.run.mockResolvedValue(FOUND);

    await runWait({ ...OPTIONS, timeoutMs: 0, intervalMs: 30_000 });

    expect(processRunner.run.mock.calls[0][2]).toBe(30_000);
  });

  it('treats a gh call killed by its own timeout as not found, and times out once the deadline is reached', async () => {
    // Mirrors what ProcessRunnerService resolves with when its own timeoutMs
    // kills a stalled `gh` call — never a rejection, so this must not crash
    // the wait, and a stalled/late call must never surface as `found`.
    processRunner.run.mockResolvedValue({
      exitCode: TIMED_OUT_EXIT_CODE,
      stdout: '',
      stderr: '',
    });

    const result = await runWait({
      ...OPTIONS,
      timeoutMs: 60_000,
      intervalMs: 30_000,
    });

    expect(result).toEqual({ found: false, timedOut: true });
  });

  it('defaults to a 10-minute timeout and a 30-second interval', async () => {
    processRunner.run.mockResolvedValue(EMPTY);

    const result = await runWait(OPTIONS);

    expect(result).toEqual({ found: false, timedOut: true });
    // Default timeout 600_000ms / interval 30_000ms: polls at
    // 0/30s/60s/.../600s — 21 polls before the deadline is hit.
    expect(processRunner.run).toHaveBeenCalledTimes(21);
  });
});
