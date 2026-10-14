import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { LocalDatabaseGuardService } from './local-database-guard.service';

describe('LocalDatabaseGuardService', () => {
  let service: LocalDatabaseGuardService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [LocalDatabaseGuardService],
    }).compile();
    service = moduleRef.get(LocalDatabaseGuardService);
  });

  it.each([
    'postgresql://postgres:postgres@localhost:5432/postgres',
    'postgresql://postgres:postgres@127.0.0.1:5432/postgres',
    'postgres://postgres@[::1]/postgres',
    'postgresql://localhost/postgres',
    'postgres://blood_bowl:blood_bowl@localhost:5433/blood_bowl',
  ])('accepts the local target %s', (url) => {
    expect(() => service.assertLocal(url)).not.toThrow();
  });

  it.each([
    'postgresql://user:hunter2@ep-x.neon.tech/neondb',
    'postgresql://postgres@localhost/postgres?host=ep-x.neon.tech',
    'postgresql://postgres@localhost/postgres?hostaddr=10.0.0.1',
    'postgresql://localhost,ep-x.neon.tech/postgres',
    'postgresql:///postgres',
  ])('refuses the non-local target %s without echoing it', (url) => {
    expect(() => service.assertLocal(url)).toThrow(
      new Error(
        'Refusing to restore into a non-local database: the target host must be localhost, 127.0.0.1 or ::1.',
      ),
    );
  });

  it.each(['not-a-url', 'mysql://localhost/db'])(
    'refuses a target that is not a postgres connection string: %s',
    (url) => {
      expect(() => service.assertLocal(url)).toThrow(
        new Error(
          'The target database must be a postgres:// or postgresql:// connection string.',
        ),
      );
    },
  );
});
