import { createReadStream, statSync } from 'node:fs';
import { open, unlink } from 'node:fs/promises';
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
    const sizeBytes = statSync(request.filePath).size;
    const body = createReadStream(request.filePath);
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: request.key,
          Body: body,
          ContentLength: sizeBytes,
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
        if (
          object.Key !== undefined &&
          object.LastModified !== undefined &&
          object.Key !== BACKUP_KEY_PREFIX &&
          !object.Key.endsWith('/')
        ) {
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
    // Same-format UTC ISO strings sort chronologically as plain strings; the
    // key breaks ties so the order is deterministic.
    return backups.sort(
      (a, b) =>
        b.lastModified.localeCompare(a.lastModified) ||
        a.key.localeCompare(b.key),
    );
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

  /**
   * Streams one backup to a new local file; never overwrites one. A partial
   * file left by a failed transfer is removed so a retry can start clean, but
   * only when this call created it.
   */
  async download(request: DownloadRequest): Promise<void> {
    const { client, bucket } = this.connection();
    let response;
    try {
      response = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: request.key }),
      );
    } catch (error) {
      if (error instanceof Error && error.name === 'NoSuchKey') {
        throw new Error(`Backup ${request.key} does not exist in the bucket.`, {
          cause: error,
        });
      }
      throw error;
    }
    if (!(response.Body instanceof Readable)) {
      throw new Error(`Backup ${request.key} returned no readable body.`);
    }
    // Opening with 'wx' fails with EEXIST before anything is created, so a
    // pre-existing file is never touched.
    let handle;
    try {
      handle = await open(request.destinationPath, 'wx');
    } catch (error) {
      // Release the socket held by the unread response.
      response.Body.destroy();
      throw error;
    }
    try {
      await pipeline(response.Body, handle.createWriteStream());
    } catch (error) {
      await handle.close().catch(() => undefined);
      await unlink(request.destinationPath).catch(() => undefined);
      throw error;
    }
  }

  private connection(): Connection {
    const settings = this.config.getStorageSettings();
    this.client ??= this.clientFactory.create(settings);
    return { client: this.client, bucket: settings.bucket };
  }
}
