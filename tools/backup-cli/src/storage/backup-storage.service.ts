import { createReadStream, createWriteStream, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';

import { BackupConfigService } from '../config/backup-config.service';
import { S3ClientFactoryService } from './s3-client-factory.service';
import { StoredBackup } from './stored-backup';

/** Every production backup's key starts with this. */
export const BACKUP_KEY_PREFIX = 'production/';

export interface UploadRequest {
  readonly key: string;
  readonly filePath: string;
}

export interface DownloadRequest {
  readonly key: string;
  readonly destinationPath: string;
}

interface Connection {
  readonly client: S3Client;
  readonly bucket: string;
}

/**
 * The backup bucket's four operations. The client is built lazily on first
 * use, not at construction, so the CLI boots (and reports a friendly
 * missing-setting error) even when storage is not configured.
 */
@Injectable()
export class BackupStorageService {
  private client: S3Client | undefined;

  constructor(
    private readonly config: BackupConfigService,
    private readonly clientFactory: S3ClientFactoryService,
  ) {}

  async upload(request: UploadRequest): Promise<void> {
    const { client, bucket } = this.connection();
    const body = createReadStream(request.filePath);
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: request.key,
          Body: body,
          ContentLength: statSync(request.filePath).size,
        }),
      );
    } finally {
      // Release the file handle even when the request failed before reading,
      // and wait for it so nothing is still opening the file afterwards.
      if (!body.closed) {
        await new Promise<void>((resolve) => {
          body.once('close', () => {
            resolve();
          });
          body.destroy();
        });
      }
    }
  }

  /** Every backup under `BACKUP_KEY_PREFIX`, newest first. */
  async list(): Promise<StoredBackup[]> {
    const { client, bucket } = this.connection();
    const backups: StoredBackup[] = [];
    let continuationToken: string | undefined;
    do {
      const page = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: BACKUP_KEY_PREFIX,
          ContinuationToken: continuationToken,
        }),
      );
      for (const object of page.Contents ?? []) {
        if (object.Key !== undefined && object.LastModified !== undefined) {
          backups.push({
            key: object.Key,
            sizeBytes: object.Size ?? 0,
            lastModified: object.LastModified.toISOString(),
          });
        }
      }
      continuationToken =
        page.IsTruncated === true ? page.NextContinuationToken : undefined;
    } while (continuationToken !== undefined);
    // Same-format UTC ISO strings sort chronologically as plain strings.
    return backups.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
  }

  /**
   * One DeleteObject per key rather than a batched DeleteObjects, which
   * needs a Content-MD5 header R2 is picky about; prune deletes at most a
   * handful of keys per run.
   */
  async delete(keys: readonly string[]): Promise<void> {
    if (keys.length === 0) {
      return;
    }
    const { client, bucket } = this.connection();
    for (const key of keys) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    }
  }

  /** Streams one backup to a new local file; never overwrites one. */
  async download(request: DownloadRequest): Promise<void> {
    const { client, bucket } = this.connection();
    const response = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: request.key }),
    );
    if (!(response.Body instanceof Readable)) {
      throw new Error(`Backup ${request.key} returned no readable body.`);
    }
    await pipeline(
      response.Body,
      createWriteStream(request.destinationPath, { flags: 'wx' }),
    );
  }

  private connection(): Connection {
    const settings = this.config.getStorageSettings();
    this.client ??= this.clientFactory.create(settings);
    return { client: this.client, bucket: settings.bucket };
  }
}
