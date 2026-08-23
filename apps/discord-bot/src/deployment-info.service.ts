import { execFileSync } from 'node:child_process';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { MAX_DESCRIPTION_LENGTH } from './description-limits';

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
  /**
   * One line summarising the running commit: the merge commit's first body
   * line (the PR title) when there is one, otherwise the subject line.
   */
  commitMessage?: string;
}

/** How many leading characters of the commit SHA the message shows. */
const SHORT_SHA_LENGTH = 7;

/**
 * A Discord embed shaped for both send paths this app uses: `discord.js`'s
 * gateway `sendMessage` accepts this as part of `InteractionReplyOptions`,
 * and the standby path's raw REST message-create call accepts the identical
 * shape as its JSON body — so one value serves both without translation.
 */
export interface StartupEmbedMessage {
  embeds: [{ title: string; description?: string }];
}

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

  /**
   * The startup status embed: one `Label: value` line per resolved field, so
   * it's readable at a glance instead of packed into one sentence, followed by
   * the commit message as its own paragraph. A field that didn't resolve is
   * omitted rather than shown as blank.
   */
  describe(role: 'active' | 'standby'): StartupEmbedMessage {
    const info = this.getDeploymentInfo();
    const lines: string[] = [];
    if (info.machineId) lines.push(`Machine: ${info.machineId}`);
    if (info.appName) lines.push(`App: ${info.appName}`);
    if (info.branch) lines.push(`Branch: ${info.branch}`);
    if (info.commitSha) {
      lines.push(`Commit: ${info.commitSha.slice(0, SHORT_SHA_LENGTH)}`);
    }
    // Two paragraphs: the labelled fields, then the commit message. Either is
    // dropped when it is empty, so nothing renders as a blank line or a
    // dangling separator.
    const paragraphs: string[] = [];
    if (lines.length > 0) paragraphs.push(lines.join('\n'));
    if (info.commitMessage) paragraphs.push(info.commitMessage);
    const description = this.enforceDescriptionLimit(paragraphs.join('\n\n'));
    return {
      embeds: [
        {
          title: `Bot starting as ${role}`,
          ...(description ? { description } : {}),
        },
      ],
    };
  }

  /**
   * Absolute safety net for Discord's embed description limit. The commit
   * message is free-form text with no inherent length ceiling (unlike the
   * other fields here, which are all structurally bounded), so unlike those
   * fields it needs truncation before Discord rejects the whole message.
   * Mirrors `StarPlayerDeepdiveService.enforceDescriptionLimit` verbatim in
   * shape.
   */
  private enforceDescriptionLimit(description: string): string {
    if (description.length <= MAX_DESCRIPTION_LENGTH) {
      return description;
    }
    return `${description.slice(0, MAX_DESCRIPTION_LENGTH - 1)}…`;
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
    const rawMessage =
      this.env('GIT_COMMIT_MESSAGE') ?? this.git(['log', '-1', '--pretty=%B']);
    if (rawMessage) {
      const commitMessage = this.deriveCommitMessage(
        rawMessage,
        this.isMergeCommit(),
      );
      if (commitMessage) info.commitMessage = commitMessage;
    }
    return info;
  }

  /**
   * A commit has a second parent only if it is a merge commit, so the
   * `rev-parse HEAD^2` lookup succeeding is the structural merge test. The
   * `GIT_IS_MERGE_COMMIT` build arg carries the same answer into the image,
   * where there is no `.git` to ask.
   */
  private isMergeCommit(): boolean {
    const fromEnv = this.env('GIT_IS_MERGE_COMMIT');
    if (fromEnv !== undefined) return fromEnv.toLowerCase() === 'true';
    return this.git(['rev-parse', 'HEAD^2']) !== undefined;
  }

  /**
   * Picks the one readable line out of a raw commit message. A merge commit's
   * subject is GitHub's `Merge pull request #N from user/branch`, which says
   * nothing useful, while its first body line is the PR title — so a merge
   * commit with a body shows that body line. Everything else shows its
   * subject.
   */
  private deriveCommitMessage(
    rawMessage: string,
    isMergeCommit: boolean,
  ): string | undefined {
    const nonBlank = rawMessage
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');
    const [subject, firstBodyLine] = nonBlank;
    if (isMergeCommit && firstBodyLine) return firstBodyLine;
    return subject;
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
