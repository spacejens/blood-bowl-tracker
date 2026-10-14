import { S3Client } from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';

import { StorageSettings } from '../config/backup-config.service';

/**
 * Builds the S3 client for Cloudflare R2. A service of its own so
 * `BackupStorageService` can be tested against a mocked client.
 */
@Injectable()
export class S3ClientFactoryService {
  create(settings: StorageSettings): S3Client {
    return new S3Client({
      // R2 ignores the region but the SDK requires one; 'auto' is R2's value.
      region: 'auto',
      endpoint: settings.endpoint,
      credentials: {
        accessKeyId: settings.accessKeyId,
        secretAccessKey: settings.secretAccessKey,
      },
      // Only send/verify checksums when an operation requires them: R2 does
      // not support every flexible-checksum algorithm the SDK defaults to.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }
}
