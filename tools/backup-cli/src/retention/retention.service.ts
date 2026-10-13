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
    if (!Number.isFinite(policy.retentionDays)) {
      throw new Error('retentionDays must be a finite number');
    }
    if (backups.length === 0) {
      return [];
    }
    const timed = backups.map((backup) => {
      const time = Date.parse(backup.lastModified);
      if (Number.isNaN(time)) {
        throw new Error(
          `Backup ${backup.key} has an unparseable lastModified timestamp`,
        );
      }
      return { backup, time };
    });
    const newest = timed.reduce((latest, candidate) =>
      candidate.time > latest.time ? candidate : latest,
    );
    const cutoff = policy.now.getTime() - policy.retentionDays * DAY_MS;
    return timed
      .filter((candidate) => candidate !== newest && candidate.time < cutoff)
      .map((candidate) => candidate.backup);
  }
}
