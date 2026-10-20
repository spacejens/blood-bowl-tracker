import { ProcessRunnerService } from '@blood-bowl-tracker/cli-shared';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { BACKUP_ALERT_LABEL } from './backup-alert-kinds';

/** A hung `gh` call must not hold a workflow job until its own timeout. */
const GH_TIMEOUT_MS = 60_000;

const openIssuesSchema = z.array(
  z.object({ number: z.number().int(), title: z.string() }),
);

export interface OpenIssue {
  readonly number: number;
  readonly title: string;
}

export interface NewIssue {
  readonly title: string;
  readonly body: string;
}

/**
 * The `gh` calls the backup alert subcommands need. `gh` takes its token and
 * repository from `GH_TOKEN` / `GH_REPO` in the environment. Any non-zero
 * exit is an error naming the command and `gh`'s stderr, so a workflow job
 * that cannot raise an alert fails visibly instead of silently.
 */
@Injectable()
export class BackupAlertIssuesService {
  constructor(private readonly processRunner: ProcessRunnerService) {}

  /** Open `backup-alert` issues titled exactly `title`, oldest first. */
  async findOpen(title: string): Promise<OpenIssue[]> {
    const stdout = await this.gh([
      'issue',
      'list',
      '--state',
      'open',
      '--label',
      BACKUP_ALERT_LABEL,
      '--json',
      'number,title',
      '--limit',
      '100',
    ]);
    const issues = openIssuesSchema.safeParse(this.parseJson(stdout));
    if (!issues.success) {
      throw new Error(
        `gh issue list printed unexpected output: '${stdout.trim()}'`,
      );
    }
    return issues.data
      .filter((issue) => issue.title === title)
      .sort((a, b) => a.number - b.number);
  }

  /**
   * Makes sure the label exists before an issue uses it: `gh issue create`
   * fails on an unknown label, which would lose the alert. `--force`
   * updates an existing label instead of failing.
   */
  async ensureLabel(): Promise<void> {
    await this.gh([
      'label',
      'create',
      BACKUP_ALERT_LABEL,
      '--color',
      'B60205',
      '--description',
      'A production backup check failed',
      '--force',
    ]);
  }

  /** Opens an issue labeled `bug` and `backup-alert`; returns its URL. */
  async create(issue: NewIssue): Promise<string> {
    const stdout = await this.gh([
      'issue',
      'create',
      '--title',
      issue.title,
      '--body',
      issue.body,
      '--label',
      'bug',
      '--label',
      BACKUP_ALERT_LABEL,
    ]);
    return stdout.trim();
  }

  async comment(issueNumber: number, body: string): Promise<void> {
    await this.gh(['issue', 'comment', String(issueNumber), '--body', body]);
  }

  async close(issueNumber: number, comment: string): Promise<void> {
    await this.gh([
      'issue',
      'close',
      String(issueNumber),
      '--comment',
      comment,
    ]);
  }

  /** Unparseable output yields `undefined`, which the schema then rejects. */
  private parseJson(text: string): unknown {
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  }

  private async gh(args: readonly string[]): Promise<string> {
    const result = await this.processRunner.run('gh', args, GH_TIMEOUT_MS);
    if (result.exitCode !== 0) {
      throw new Error(
        `gh ${args[0]} ${args[1]} failed (exit ${result.exitCode}): ` +
          result.stderr.trim(),
      );
    }
    return result.stdout;
  }
}
