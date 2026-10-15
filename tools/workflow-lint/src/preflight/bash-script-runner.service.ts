import { spawnSync } from 'node:child_process';

import { Injectable } from '@nestjs/common';

/** Outcome of one script run; `status` is null if bash was killed by a signal. */
export interface ScriptResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/**
 * Runs a workflow step's `run:` script the way GitHub Actions does when no
 * shell is given (`bash -e`), with only the given variables plus `PATH` in
 * its environment, so a test controls every value the script can see.
 */
@Injectable()
export class BashScriptRunnerService {
  run(script: string, env: Readonly<Record<string, string>>): ScriptResult {
    const result = spawnSync('bash', ['-e', '-c', script], {
      env: { PATH: process.env.PATH, ...env },
      encoding: 'utf8',
    });
    if (result.error) {
      throw result.error;
    }
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }
}
