import { Injectable } from '@nestjs/common';

import { BackupAlertRequest } from './backup-alert-args.service';
import { BackupAlertIssuesService } from './backup-alert-issues.service';

export interface ResolveAlertResult {
  readonly kind: string;
  /** Numbers of the issues closed; empty when none was open. */
  readonly closed: readonly number[];
}

/**
 * `resolve-alert`: a successful run closes every open issue of its kind,
 * commenting with a link to that run. Nothing open means nothing to do.
 */
@Injectable()
export class ResolveAlertService {
  constructor(private readonly issues: BackupAlertIssuesService) {}

  async run(request: BackupAlertRequest): Promise<ResolveAlertResult> {
    const { kind, runUrl } = request;
    const open = await this.issues.findOpen(kind.title);
    for (const issue of open) {
      await this.issues.close(
        issue.number,
        `Resolved: a later run succeeded: ${runUrl}`,
      );
    }
    return { kind: kind.id, closed: open.map((issue) => issue.number) };
  }
}
