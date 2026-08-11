import { execFile } from 'node:child_process';

import { Injectable } from '@nestjs/common';

/** The full outcome of one child process, including a non-zero exit. */
export interface ProcessResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Thin `child_process.execFile` wrapper. Every git/diff call in this package
 * goes through it so services can be unit-tested against a mock instead of a
 * real repository.
 *
 * A non-zero exit is a normal, resolved result — `git log @{u}..HEAD` exits 1
 * when there is no upstream, and `diff` exits 1 precisely when two files
 * differ, so callers need the code rather than an exception. Only a process
 * that could not be spawned (or was killed by a signal) rejects.
 */
@Injectable()
export class ProcessRunnerService {
  run(command: string, args: readonly string[]): Promise<ProcessResult> {
    return new Promise<ProcessResult>((resolve, reject) => {
      execFile(
        command,
        [...args],
        { maxBuffer: 32 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (!error) {
            resolve({ exitCode: 0, stdout, stderr });
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
    });
  }
}
