import { Injectable } from '@nestjs/common';

import { BackupConfigService } from '../config/backup-config.service';
import { BackupStorageService } from '../storage/backup-storage.service';
import {
  BackupFreshnessService,
  FreshnessResult,
} from './backup-freshness.service';

/**
 * `check-freshness`: fail unless the newest stored backup is at most
 * `maxAgeHours` old. Needs only the read-only storage token.
 */
@Injectable()
export class CheckFreshnessService {
  constructor(
    private readonly config: BackupConfigService,
    private readonly storage: BackupStorageService,
    private readonly freshness: BackupFreshnessService,
  ) {}

  async run(): Promise<FreshnessResult> {
    const maxAgeHours = this.config.getMaxAgeHours();
    const backups = await this.storage.list();
    return this.freshness.assess(backups, { now: new Date(), maxAgeHours });
  }
}
