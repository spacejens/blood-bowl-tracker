import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

import { Injectable } from '@nestjs/common';

import { ChildProcessService } from '../shared/child-process.service';
import { GitRootsService } from '../shared/git-roots.service';

/**
 * Worktree-relative, gitignored path recording the tunnel's own pid across
 * separate CLI invocations — `start` and `stop` run as separate tool calls,
 * so shell-local state (a `$!` from a plain background command) would not
 * survive between them.
 */
const PID_FILE = '.superpowers/deploy-production/tunnel.pid';

export interface StartProductionTunnelResult {
  readonly pid: number;
}

export interface StopProductionTunnelResult {
  /** False when there was no persisted tunnel, or it had already exited. */
  readonly stopped: boolean;
}

/**
 * Starts and stops `deploy-production`'s `flyctl proxy` tunnel as a
 * detached process, tracking ownership by pid rather than by matching
 * `flyctl proxy` command lines — a broad `pkill -f` cannot tell this run's
 * tunnel apart from a different one that happens to share the same
 * local:remote port mapping (e.g. a later run reusing the port after this
 * run's own tunnel already died).
 */
@Injectable()
export class ProductionTunnelService {
  constructor(
    private readonly childProcess: ChildProcessService,
    private readonly gitRoots: GitRootsService,
  ) {}

  async start(
    localPort: number,
    remotePort: number,
  ): Promise<StartProductionTunnelResult> {
    const pid = this.childProcess.spawnDetached('flyctl', [
      'proxy',
      `${localPort}:${remotePort}`,
    ]);
    const pidFile = await this.pidFilePath();
    mkdirSync(dirname(pidFile), { recursive: true });
    writeFileSync(pidFile, String(pid), 'utf8');
    return { pid };
  }

  async stop(): Promise<StopProductionTunnelResult> {
    const pidFile = await this.pidFilePath();
    if (!existsSync(pidFile)) {
      return { stopped: false };
    }
    const pid = Number(readFileSync(pidFile, 'utf8').trim());
    rmSync(pidFile, { force: true });
    // A pid of 0 or negative is not a real process id we ever wrote — signal
    // 0 targets the whole process group, and a negative pid targets every
    // process the caller can signal. Neither is safe to pass through.
    if (!Number.isInteger(pid) || pid <= 0) {
      return { stopped: false };
    }
    return { stopped: this.childProcess.kill(pid) };
  }

  private async pidFilePath(): Promise<string> {
    const roots = await this.gitRoots.resolve();
    return join(roots.worktreeRoot, PID_FILE);
  }
}
