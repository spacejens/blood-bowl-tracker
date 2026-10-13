import { Injectable } from '@nestjs/common';

import { BackupConfigService } from '../config/backup-config.service';
import { RetentionService } from '../retention/retention.service';
import { BackupStorageService } from '../storage/backup-storage.service';

export interface PruneBackupsResult {
  readonly retentionDays: number;
  readonly deleted: string[];
  readonly kept: number;
}

/** `prune`: delete every backup the retention policy says has expired. */
@Injectable()
export class PruneBackupsService {
  constructor(
    private readonly config: BackupConfigService,
    private readonly storage: BackupStorageService,
    private readonly retention: RetentionService,
  ) {}

  async run(): Promise<PruneBackupsResult> {
    const retentionDays = this.config.getRetentionDays();
    const backups = await this.storage.list();
    const deleted = this.retention
      .selectExpired(backups, { now: new Date(), retentionDays })
      .map((backup) => backup.key);
    await this.storage.delete(deleted);
    return { retentionDays, deleted, kept: backups.length - deleted.length };
  }
}
