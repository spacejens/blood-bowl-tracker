/**
 * Every backup alert issue carries this label (plus `bug`). Together with the
 * kind's fixed title it identifies the one open issue per kind.
 */
export const BACKUP_ALERT_LABEL = 'backup-alert';

/** One kind of backup alert: which check failed, and its issue's title. */
export interface BackupAlertKind {
  /** The `<kind>` argument of `raise-alert` / `resolve-alert`. */
  readonly id: string;
  /** Fixed issue title; at most one open `backup-alert` issue has it. */
  readonly title: string;
  /** First sentence of a new issue's body: what failed. */
  readonly failure: string;
}

export const BACKUP_ALERT_KINDS: readonly BackupAlertKind[] = [
  {
    id: 'backup',
    title: 'Production backup failed',
    failure:
      'A run of the production database backup workflow ' +
      '(`backup-production.yml`) failed, so no new backup may have been stored.',
  },
  {
    id: 'verify',
    title: 'Production backup verification failed',
    failure:
      'A run of the backup verification workflow (`verify-backup.yml`) ' +
      'failed, so the newest backup may not restore.',
  },
  {
    id: 'stale',
    title: 'Newest production backup is stale',
    failure:
      'A run of the backup freshness check (`check-backup-freshness.yml`) ' +
      'failed: the newest backup is missing or older than the limit, or the ' +
      'check itself could not run.',
  },
];
