import { spawn } from 'node:child_process';

import { Injectable } from '@nestjs/common';

/**
 * Thin wrapper around `child_process.spawn`/`process.kill` for a
 * long-running detached process (e.g. `flyctl proxy`) whose lifecycle spans
 * separate tool invocations — unlike `ProcessRunnerService`, which runs a
 * command to completion and returns its result.
 */
@Injectable()
export class ChildProcessService {
  /**
   * Spawns `command` detached from this process and immediately returns its
   * pid, without waiting for it to exit. `unref()` lets this process exit
   * (or, here, the CLI subcommand return) without keeping the child alive
   * or waiting on it.
   */
  spawnDetached(command: string, args: readonly string[]): number {
    const child = spawn(command, [...args], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    // A failure to actually exec (e.g. ENOENT) surfaces asynchronously as an
    // 'error' event, after this call has already returned. There is no
    // caller left to hand that to once the pid check below has passed, so
    // swallow it here rather than letting it become an unhandled exception —
    // the synchronous pid check is this method's only error signal.
    child.on('error', () => {});
    if (child.pid === undefined) {
      throw new Error(`${command} ${args.join(' ')} failed to start (no pid)`);
    }
    return child.pid;
  }

  /**
   * Signals `pid`. Returns `false` (rather than throwing) when the process
   * is already gone — the normal case when a tunnel exited on its own
   * before teardown ran.
   */
  kill(pid: number, signal: NodeJS.Signals = 'SIGTERM'): boolean {
    try {
      process.kill(pid, signal);
      return true;
    } catch (error) {
      if (
        error instanceof Error &&
        (error as NodeJS.ErrnoException).code === 'ESRCH'
      ) {
        return false;
      }
      throw error;
    }
  }
}
