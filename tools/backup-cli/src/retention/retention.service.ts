import { Injectable } from '@nestjs/common';

import { StoredBackup } from '../storage/stored-backup';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RetentionPolicy {
  readonly now: Date;
  readonly retentionDays: number;
}

/**
 * Decides which backups `prune` deletes: everything uploaded more than
 * `retentionDays` before `now`, except the newest backup. That exception
 * means a wrong clock, a mistyped retention setting, or a run of failed
 * backups can never leave the bucket empty.
 */
@Injectable()
export class RetentionService {
  selectExpired(
    backups: readonly StoredBackup[],
    policy: RetentionPolicy,
  ): StoredBackup[] {
    if (backups.length === 0) {
      return [];
    }
    const newest = backups.reduce((latest, candidate) =>
      Date.parse(candidate.lastModified) > Date.parse(latest.lastModified)
        ? candidate
        : latest,
    );
    const cutoff = policy.now.getTime() - policy.retentionDays * DAY_MS;
    return backups.filter(
      (candidate) =>
        candidate !== newest && Date.parse(candidate.lastModified) < cutoff,
    );
  }
}
