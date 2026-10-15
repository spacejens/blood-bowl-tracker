import { Injectable } from '@nestjs/common';

import { StoredBackup } from '../storage/stored-backup';

const HOUR_MS = 60 * 60 * 1000;

export interface FreshnessPolicy {
  readonly now: Date;
  readonly maxAgeHours: number;
}

/** What `check-freshness` prints when the newest backup is recent enough. */
export interface FreshnessResult {
  readonly key: string;
  /** The newest backup's upload time, as the bucket reports it. */
  readonly createdAt: string;
  /** Hours between that upload and `now`, rounded to two decimals. */
  readonly ageHours: number;
  readonly maxAgeHours: number;
}

/**
 * Decides whether the newest backup is recent enough: no older than
 * `maxAgeHours` before `now` (exactly at the limit still passes). The newest
 * is found by upload time rather than trusting list order, and, as in
 * `prune`, any unparseable upload time is an error rather than a guess.
 */
@Injectable()
export class BackupFreshnessService {
  assess(
    backups: readonly StoredBackup[],
    policy: FreshnessPolicy,
  ): FreshnessResult {
    if (backups.length === 0) {
      throw new Error('No backups found: the bucket holds no backup at all.');
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
    // A future timestamp (clock skew) gives a negative age and passes: only
    // a backup that is too old is a problem.
    const ageMs = policy.now.getTime() - newest.time;
    const ageHours = Math.round((ageMs / HOUR_MS) * 100) / 100;
    if (ageMs > policy.maxAgeHours * HOUR_MS) {
      throw new Error(
        `Newest backup ${newest.backup.key} (created ${newest.backup.lastModified}) ` +
          `is ${ageHours} hours old, older than the ${policy.maxAgeHours}-hour limit.`,
      );
    }
    return {
      key: newest.backup.key,
      createdAt: newest.backup.lastModified,
      ageHours,
      maxAgeHours: policy.maxAgeHours,
    };
  }
}
