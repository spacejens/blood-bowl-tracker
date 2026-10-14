import { statSync } from 'node:fs';
import { resolve } from 'node:path';

import { Injectable } from '@nestjs/common';

import { BackupStorageService } from '../storage/backup-storage.service';

export interface DownloadBackupRequest {
  readonly destinationPath: string;
  /** The backup to fetch; the newest one when omitted. */
  readonly key?: string;
}

export interface DownloadBackupResult {
  readonly key: string;
  readonly path: string;
  readonly sizeBytes: number;
}

/** `download`: fetch one backup, or the newest, to a new local file. */
@Injectable()
export class DownloadBackupService {
  constructor(private readonly storage: BackupStorageService) {}

  async run(request: DownloadBackupRequest): Promise<DownloadBackupResult> {
    const key = request.key ?? (await this.newestKey());
    const path = resolve(request.destinationPath);
    await this.storage.download({ key, destinationPath: path });
    return { key, path, sizeBytes: statSync(path).size };
  }

  /** `BackupStorageService.list` is newest-first by contract. */
  private async newestKey(): Promise<string> {
    const [newest] = await this.storage.list();
    if (newest === undefined) {
      throw new Error('No backups stored yet — nothing to download.');
    }
    return newest.key;
  }
}
