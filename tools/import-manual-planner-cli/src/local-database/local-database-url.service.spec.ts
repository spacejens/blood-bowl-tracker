import {
  DEFAULT_LOCAL_DATABASE_URL,
  LocalDatabaseGuardService,
} from '@blood-bowl-tracker/cli-shared';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import {
  LOCAL_DATABASE_ENV,
  type LocalDatabaseEnv,
  LocalDatabaseUrlService,
} from './local-database-url.service';

async function makeService(
  env: LocalDatabaseEnv,
  guard: MockProxy<LocalDatabaseGuardService> = mock<LocalDatabaseGuardService>(),
): Promise<{
  service: LocalDatabaseUrlService;
  guard: MockProxy<LocalDatabaseGuardService>;
}> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      LocalDatabaseUrlService,
      { provide: LOCAL_DATABASE_ENV, useValue: env },
      { provide: LocalDatabaseGuardService, useValue: guard },
    ],
  }).compile();
  return { service: moduleRef.get(LocalDatabaseUrlService), guard };
}

describe('LocalDatabaseUrlService', () => {
  it('defaults to the docker-compose database, guarded', async () => {
    const { service, guard } = await makeService({});

    expect(service.resolve()).toBe(
      `${DEFAULT_LOCAL_DATABASE_URL}?client_min_messages=warning`,
    );
    expect(guard.assertLocal).toHaveBeenCalledWith(DEFAULT_LOCAL_DATABASE_URL);
  });

  it('takes LOCAL_DATABASE_URL when set', async () => {
    const url = 'postgres://postgres:postgres@localhost:5432/scratch';
    const { service, guard } = await makeService({ LOCAL_DATABASE_URL: url });

    expect(service.resolve()).toBe(`${url}?client_min_messages=warning`);
    expect(guard.assertLocal).toHaveBeenCalledWith(url);
  });

  it('keeps the parameters LOCAL_DATABASE_URL already has', async () => {
    const { service } = await makeService({
      LOCAL_DATABASE_URL: 'postgres://p:p@[::1]:5433/db?sslmode=disable',
    });

    expect(service.resolve()).toBe(
      'postgres://p:p@[::1]:5433/db?sslmode=disable&client_min_messages=warning',
    );
  });

  it('silences NOTICEs even when LOCAL_DATABASE_URL asks for them', async () => {
    const { service } = await makeService({
      LOCAL_DATABASE_URL:
        'postgres://p:p@localhost:5433/db?client_min_messages=notice',
    });

    expect(service.resolve()).toBe(
      'postgres://p:p@localhost:5433/db?client_min_messages=warning',
    );
  });

  it('treats an empty LOCAL_DATABASE_URL as unset', async () => {
    const { service } = await makeService({ LOCAL_DATABASE_URL: '' });

    expect(service.resolve()).toBe(
      `${DEFAULT_LOCAL_DATABASE_URL}?client_min_messages=warning`,
    );
  });

  it('refuses a URL the guard refuses', async () => {
    const guard = mock<LocalDatabaseGuardService>();
    guard.assertLocal.mockImplementation(() => {
      throw new Error('Refusing to use a non-local database');
    });
    const { service } = await makeService(
      { LOCAL_DATABASE_URL: 'postgres://x@ep-x.neon.tech/db' },
      guard,
    );

    expect(() => service.resolve()).toThrow(
      'Refusing to use a non-local database',
    );
  });
});
