import { execFile } from 'node:child_process';

import { Injectable } from '@nestjs/common';

/** The full outcome of one child process, including a non-zero exit. */
export interface ProcessResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** `exitCode` used for a process killed by our own `timeoutMs`, never a real exit code. */
export const TIMED_OUT_EXIT_CODE = -1;

/**
 * How long to wait after `SIGTERM` before escalating to `SIGKILL`. A process
 * that traps or ignores `SIGTERM` would otherwise never exit, and
 * `execFile`'s callback does not fire until the child actually exits — so
 * without this escalation, a single unresponsive child could hang `run`
 * past its own `timeoutMs` forever, defeating the deadline entirely.
 * `SIGKILL` cannot be trapped or ignored, so this bounds the wait for real.
 */
const SIGKILL_GRACE_MS = 2_000;

/**
 * Thin `child_process.execFile` wrapper. Every git/diff call in this package
 * goes through it so services can be unit-tested against a mock instead of a
 * real repository.
 *
 * A non-zero exit is a normal, resolved result — `git log @{u}..HEAD` exits 1
 * when there is no upstream, and `diff` exits 1 precisely when two files
 * differ, so callers need the code rather than an exception. Only a process
 * that could not be spawned, or was killed by a signal we did not request via
 * `timeoutMs`, rejects — a process killed by our own `timeoutMs` (whether it
 * exited on `SIGTERM` or needed escalation to `SIGKILL`) resolves with
 * `TIMED_OUT_EXIT_CODE` instead, so a caller polling on a deadline (e.g.
 * `WaitForPrReviewService`) can treat "took too long" the same way it treats
 * any other non-zero exit, without an unhandled rejection.
 */
@Injectable()
export class ProcessRunnerService {
  run(
    command: string,
    args: readonly string[],
    timeoutMs?: number,
  ): Promise<ProcessResult> {
    return new Promise<ProcessResult>((resolve, reject) => {
      let timedOut = false;
      let killTimer: NodeJS.Timeout | undefined;
      let escalateTimer: NodeJS.Timeout | undefined;

      const child = execFile(
        command,
        [...args],
        { maxBuffer: 32 * 1024 * 1024 },
        (error, stdout, stderr) => {
          clearTimeout(killTimer);
          clearTimeout(escalateTimer);
          if (!error) {
            resolve({ exitCode: 0, stdout, stderr });
            return;
          }
          if (timedOut) {
            resolve({ exitCode: TIMED_OUT_EXIT_CODE, stdout, stderr });
            return;
          }
          // `error.code` is a number for a normal non-zero exit and a string
          // (e.g. 'ENOENT') when the process could not be spawned. Check it
          // in its own statement so TypeScript narrows it to `number` below;
          // folding this into the `!error` guard above defeats narrowing.
          if (typeof error.code !== 'number') {
            // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
            reject(error);
            return;
          }
          resolve({ exitCode: error.code, stdout, stderr });
        },
      );

      if (timeoutMs !== undefined) {
        killTimer = setTimeout(() => {
          timedOut = true;
          child.kill('SIGTERM');
          escalateTimer = setTimeout(() => {
            child.kill('SIGKILL');
          }, SIGKILL_GRACE_MS);
        }, timeoutMs);
      }
    });
  }
}
