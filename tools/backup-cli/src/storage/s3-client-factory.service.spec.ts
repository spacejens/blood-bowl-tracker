import { S3Client } from '@aws-sdk/client-s3';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { S3ClientFactoryService } from './s3-client-factory.service';

describe('S3ClientFactoryService', () => {
  let service: S3ClientFactoryService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [S3ClientFactoryService],
    }).compile();
    service = moduleRef.get(S3ClientFactoryService);
  });

  it('builds an S3 client for R2 with the configured credentials', async () => {
    const client = service.create({
      endpoint: 'https://acct.r2.cloudflarestorage.com',
      bucket: 'bucket',
      accessKeyId: 'AKID',
      secretAccessKey: 'SECRET',
    });

    expect(client).toBeInstanceOf(S3Client);
    await expect(client.config.region()).resolves.toBe('auto');
    await expect(client.config.credentials()).resolves.toMatchObject({
      accessKeyId: 'AKID',
      secretAccessKey: 'SECRET',
    });
    client.destroy();
  });
});
