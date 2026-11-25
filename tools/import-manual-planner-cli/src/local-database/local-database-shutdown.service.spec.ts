import { DB, type Db } from '@blood-bowl-tracker/db';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { mockDeep } from 'vitest-mock-extended';

import { LocalDatabaseShutdownService } from './local-database-shutdown.service';

describe('LocalDatabaseShutdownService', () => {
  it('ends the postgres client when the context closes, so the CLI can exit', async () => {
    const db = mockDeep<Db>();
    vi.mocked(db.$client.end).mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [LocalDatabaseShutdownService, { provide: DB, useValue: db }],
    }).compile();

    await moduleRef.get(LocalDatabaseShutdownService).onModuleDestroy();

    expect(db.$client.end).toHaveBeenCalledTimes(1);
  });
});
