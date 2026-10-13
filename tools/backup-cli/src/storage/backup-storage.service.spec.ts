import {
  existsSync,
  mkdtempSync,
  readFileSync,
  ReadStream,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import {
  BackupConfigService,
  StorageSettings,
} from '../config/backup-config.service';
import {
  BACKUP_KEY_PREFIX,
  BackupStorageService,
} from './backup-storage.service';
import { S3ClientFactoryService } from './s3-client-factory.service';

const SETTINGS: StorageSettings = {
  endpoint: 'https://acct.r2.cloudflarestorage.com',
  bucket: 'bbt-backups',
  accessKeyId: 'AKID',
  secretAccessKey: 'SECRET',
};

describe('BackupStorageService', () => {
  let service: BackupStorageService;
  let config: MockProxy<BackupConfigService>;
  let factory: MockProxy<S3ClientFactoryService>;
  let client: MockProxy<S3Client>;
  let dir: string;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'backup-storage-'));
    config = mock<BackupConfigService>();
    config.getStorageSettings.mockReturnValue(SETTINGS);
    client = mock<S3Client>();
    factory = mock<S3ClientFactoryService>();
    factory.create.mockReturnValue(client);
    const moduleRef = await Test.createTestingModule({
      providers: [
        BackupStorageService,
        { provide: BackupConfigService, useValue: config },
        { provide: S3ClientFactoryService, useValue: factory },
      ],
    }).compile();
    service = moduleRef.get(BackupStorageService);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function sentCommand(index: number): unknown {
    return client.send.mock.calls[index][0];
  }

  describe('upload', () => {
    it('puts the file under the given key with its content length', async () => {
      const filePath = join(dir, 'backup.dump');
      writeFileSync(filePath, 'dump-bytes');
      client.send.mockResolvedValueOnce({} as never);

      await service.upload({ key: 'production/a.dump', filePath });

      const command = sentCommand(0);
      expect(command).toBeInstanceOf(PutObjectCommand);
      const input = (command as PutObjectCommand).input;
      expect(input).toMatchObject({
        Bucket: 'bbt-backups',
        Key: 'production/a.dump',
        ContentLength: 10,
      });
      (input.Body as ReadStream).destroy();
    });

    it('propagates an upload failure', async () => {
      const filePath = join(dir, 'backup.dump');
      writeFileSync(filePath, 'x');
      client.send.mockRejectedValueOnce(new Error('AccessDenied'));

      await expect(
        service.upload({ key: 'production/a.dump', filePath }),
      ).rejects.toThrow('AccessDenied');
    });
  });

  describe('list', () => {
    it('lists the production prefix newest first', async () => {
      client.send.mockResolvedValueOnce({
        Contents: [
          {
            Key: 'production/old.dump',
            Size: 10,
            LastModified: new Date('2026-09-01T03:17:00Z'),
          },
          {
            Key: 'production/new.dump',
            Size: 20,
            LastModified: new Date('2026-10-01T03:17:00Z'),
          },
        ],
        IsTruncated: false,
      } as never);

      await expect(service.list()).resolves.toEqual([
        {
          key: 'production/new.dump',
          sizeBytes: 20,
          lastModified: '2026-10-01T03:17:00.000Z',
        },
        {
          key: 'production/old.dump',
          sizeBytes: 10,
          lastModified: '2026-09-01T03:17:00.000Z',
        },
      ]);
      const command = sentCommand(0);
      expect(command).toBeInstanceOf(ListObjectsV2Command);
      expect((command as ListObjectsV2Command).input).toMatchObject({
        Bucket: 'bbt-backups',
        Prefix: BACKUP_KEY_PREFIX,
      });
    });

    it('follows continuation tokens across pages', async () => {
      client.send
        .mockResolvedValueOnce({
          Contents: [
            {
              Key: 'production/a.dump',
              Size: 1,
              LastModified: new Date('2026-10-01T00:00:00Z'),
            },
          ],
          IsTruncated: true,
          NextContinuationToken: 'page-2',
        } as never)
        .mockResolvedValueOnce({
          Contents: [
            {
              Key: 'production/b.dump',
              Size: 1,
              LastModified: new Date('2026-10-02T00:00:00Z'),
            },
          ],
          IsTruncated: false,
        } as never);

      const backups = await service.list();

      expect(backups.map((b) => b.key)).toEqual([
        'production/b.dump',
        'production/a.dump',
      ]);
      expect(
        (sentCommand(1) as ListObjectsV2Command).input.ContinuationToken,
      ).toBe('page-2');
    });

    it('skips incomplete entries, defaults a missing size, and handles an empty bucket', async () => {
      client.send
        .mockResolvedValueOnce({
          Contents: [
            { Size: 1, LastModified: new Date('2026-10-01T00:00:00Z') },
            { Key: 'production/no-date.dump', Size: 1 },
            {
              Key: 'production/no-size.dump',
              LastModified: new Date('2026-10-01T00:00:00Z'),
            },
          ],
          IsTruncated: false,
        } as never)
        .mockResolvedValueOnce({ IsTruncated: false } as never);

      await expect(service.list()).resolves.toEqual([
        {
          key: 'production/no-size.dump',
          sizeBytes: 0,
          lastModified: '2026-10-01T00:00:00.000Z',
        },
      ]);
      await expect(service.list()).resolves.toEqual([]);
    });

    it('builds the S3 client only once across calls', async () => {
      client.send.mockResolvedValue({ IsTruncated: false } as never);

      await service.list();
      await service.list();

      expect(factory.create).toHaveBeenCalledTimes(1);
      expect(factory.create).toHaveBeenCalledWith(SETTINGS);
    });
  });

  describe('delete', () => {
    it('deletes each key with its own request', async () => {
      client.send.mockResolvedValue({} as never);

      await service.delete(['production/a.dump', 'production/b.dump']);

      expect(client.send).toHaveBeenCalledTimes(2);
      expect(sentCommand(0)).toBeInstanceOf(DeleteObjectCommand);
      expect((sentCommand(1) as DeleteObjectCommand).input).toEqual({
        Bucket: 'bbt-backups',
        Key: 'production/b.dump',
      });
    });

    it('sends nothing for an empty key list', async () => {
      await service.delete([]);

      expect(client.send).not.toHaveBeenCalled();
    });
  });

  describe('download', () => {
    it('streams the object body to the destination file', async () => {
      const destinationPath = join(dir, 'out.dump');
      client.send.mockResolvedValueOnce({
        Body: Readable.from([Buffer.from('dump-bytes')]),
      } as never);

      await service.download({ key: 'production/a.dump', destinationPath });

      expect(readFileSync(destinationPath, 'utf8')).toBe('dump-bytes');
      expect(sentCommand(0)).toBeInstanceOf(GetObjectCommand);
      expect((sentCommand(0) as GetObjectCommand).input).toEqual({
        Bucket: 'bbt-backups',
        Key: 'production/a.dump',
      });
    });

    it('refuses to overwrite an existing file', async () => {
      const destinationPath = join(dir, 'out.dump');
      writeFileSync(destinationPath, 'keep-me');
      client.send.mockResolvedValueOnce({
        Body: Readable.from([Buffer.from('new')]),
      } as never);

      await expect(
        service.download({ key: 'production/a.dump', destinationPath }),
      ).rejects.toThrow(/EEXIST/);
      expect(readFileSync(destinationPath, 'utf8')).toBe('keep-me');
    });

    it('throws when the object has no readable body', async () => {
      const destinationPath = join(dir, 'out.dump');
      client.send.mockResolvedValueOnce({} as never);

      await expect(
        service.download({ key: 'production/a.dump', destinationPath }),
      ).rejects.toThrow(/production\/a\.dump returned no readable body/);
      expect(existsSync(destinationPath)).toBe(false);
    });
  });
});
