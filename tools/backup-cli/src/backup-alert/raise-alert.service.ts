import { Injectable } from '@nestjs/common';

import { BackupAlertRequest } from './backup-alert-args.service';
import { BackupAlertIssuesService } from './backup-alert-issues.service';

export type RaiseAlertResult =
  | {
      readonly kind: string;
      readonly action: 'created';
      readonly issueUrl: string;
    }
  | {
      readonly kind: string;
      readonly action: 'commented';
      readonly issueNumber: number;
    };

/**
 * `raise-alert`: keeps at most one open issue per alert kind. A failure while
 * one is open adds a comment linking the new failed run; otherwise a new
 * issue is opened.
 */
@Injectable()
export class RaiseAlertService {
  constructor(private readonly issues: BackupAlertIssuesService) {}

  async run(request: BackupAlertRequest): Promise<RaiseAlertResult> {
    const { kind, runUrl } = request;
    const [existing] = await this.issues.findOpen(kind.title);
    if (existing !== undefined) {
      await this.issues.comment(existing.number, `Failed again: ${runUrl}`);
      return {
        kind: kind.id,
        action: 'commented',
        issueNumber: existing.number,
      };
    }
    await this.issues.ensureLabel();
    const issueUrl = await this.issues.create({
      title: kind.title,
      body: this.body(request),
    });
    return { kind: kind.id, action: 'created', issueUrl };
  }

  private body(request: BackupAlertRequest): string {
    return [
      request.kind.failure,
      '',
      `Failed run: ${request.runUrl}`,
      '',
      'Further failures of the same kind are added here as comments. This ' +
        'issue is closed automatically when a later run of the same ' +
        'workflow succeeds; a maintainer can also close it by hand.',
      '',
      `How to act on it: see ${this.docsUrl(request.runUrl)}.`,
    ].join('\n');
  }

  /**
   * The alerts section of the backup docs on `main`, in the repository the
   * (already validated) run URL belongs to.
   */
  private docsUrl(runUrl: string): string {
    const repoUrl = runUrl.replace(/\/actions\/runs\/\d+$/, '');
    return `${repoUrl}/blob/main/docs/discord-bot/production-backups.md#alerts`;
  }
}
