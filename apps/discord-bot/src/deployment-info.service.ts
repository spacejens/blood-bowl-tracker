import { execFileSync } from 'node:child_process';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Identity of this running instance, for the startup message. Every field is
 * optional on purpose: this is informational, so a missing env var or a failed
 * `git` shell-out omits a field rather than failing startup (unlike required
 * runtime config, which stays fail-fast).
 */
export interface DeploymentInfo {
  machineId?: string;
  appName?: string;
  branch?: string;
  commitSha?: string;
}

/** How many leading characters of the commit SHA the message shows. */
const SHORT_SHA_LENGTH = 7;

@Injectable()
export class DeploymentInfoService {
  private cached?: DeploymentInfo;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Resolved once per process: `GIT_SHA`/`GIT_BRANCH` are baked into the image
   * at build time, and the `git` fallback only applies to a bare
   * `pnpm start:dev` run, so neither can change while the process lives.
   */
  getDeploymentInfo(): DeploymentInfo {
    this.cached ??= this.resolve();
    return this.cached;
  }

  /** One-line startup status message, omitting every unresolved field. */
  describe(role: 'active' | 'standby'): string {
    const info = this.getDeploymentInfo();
    const parts: string[] = [];
    if (info.machineId) parts.push(`machine ${info.machineId}`);
    if (info.appName) parts.push(`app ${info.appName}`);
    if (info.branch) parts.push(`branch ${info.branch}`);
    if (info.commitSha) {
      parts.push(`commit ${info.commitSha.slice(0, SHORT_SHA_LENGTH)}`);
    }
    const suffix = parts.length > 0 ? ` (${parts.join(', ')})` : '';
    return `Bot starting as **${role}**${suffix}`;
  }

  private resolve(): DeploymentInfo {
    const info: DeploymentInfo = {};
    const machineId = this.env('FLY_MACHINE_ID');
    if (machineId) info.machineId = machineId;
    const appName = this.env('FLY_APP_NAME');
    if (appName) info.appName = appName;
    const branch =
      this.env('GIT_BRANCH') ?? this.git(['branch', '--show-current']);
    if (branch) info.branch = branch;
    const commitSha = this.env('GIT_SHA') ?? this.git(['rev-parse', 'HEAD']);
    if (commitSha) info.commitSha = commitSha;
    return info;
  }

  private env(key: string): string | undefined {
    const value = this.configService.get<string>(key);
    return value ? value.trim() : undefined;
  }

  /**
   * Best-effort `git` shell-out for bare local runs, where the checkout still
   * has `.git`. The production image excludes `.git` via `.dockerignore`, so
   * this always fails there — hence the swallowed error.
   */
  private git(args: string[]): string | undefined {
    try {
      const output = execFileSync('git', args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      return output === '' ? undefined : output;
    } catch {
      return undefined;
    }
  }
}
