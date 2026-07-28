import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ApiTokenAuthService } from './api-token-auth.service';

describe('ApiTokenAuthService', () => {
  let config: MockProxy<ConfigService>;

  const tokens: Record<string, string | undefined> = {
    API_TOKEN_IMPORT_BBL: 'bbl-secret',
    API_TOKEN_IMPORT_TP: 'tp-secret',
    API_TOKEN_IMPORT_MANUAL: 'manual-secret',
  };

  // The service reads its env vars once at construction, so what each token is
  // configured to has to be decided before the module is compiled — hence a
  // per-test factory rather than a shared subject built in beforeEach.
  async function makeService(
    configured: Record<string, string | undefined> = tokens,
  ): Promise<ApiTokenAuthService> {
    config.get.mockImplementation((key: string) => configured[key]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        ApiTokenAuthService,
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    return moduleRef.get(ApiTokenAuthService);
  }

  beforeEach(() => {
    config = mock<ConfigService>();
  });

  it.each([
    ['API_TOKEN_IMPORT_BBL', 'bbl-secret', 'import-bbl'],
    ['API_TOKEN_IMPORT_TP', 'tp-secret', 'import-tp'],
    ['API_TOKEN_IMPORT_MANUAL', 'manual-secret', 'import-manual'],
  ])(
    'authenticates the token from %s as caller %s',
    async (_envVar, token, callerName) => {
      const service = await makeService();
      expect(service.authenticate(`Bearer ${token}`)).toEqual({
        authenticated: true,
        callerName,
      });
    },
  );

  it('rejects a missing Authorization header', async () => {
    const service = await makeService();
    expect(service.authenticate(undefined)).toEqual({ authenticated: false });
  });

  it('rejects a header without the Bearer prefix', async () => {
    const service = await makeService();
    expect(service.authenticate('bbl-secret')).toEqual({
      authenticated: false,
    });
  });

  it('rejects a Basic authorization header', async () => {
    const service = await makeService();
    expect(service.authenticate('Basic YmJsLXNlY3JldA==')).toEqual({
      authenticated: false,
    });
  });

  it('rejects an unknown token of the same length as a configured one', async () => {
    const service = await makeService();
    // Same length as 'bbl-secret', so the length pre-check passes and the
    // timing-safe comparison itself is what rejects it.
    expect(service.authenticate('Bearer xxx-xxxxxx')).toEqual({
      authenticated: false,
    });
  });

  it('rejects a token that is a prefix of a configured one', async () => {
    const service = await makeService();
    expect(service.authenticate('Bearer bbl-')).toEqual({
      authenticated: false,
    });
  });

  it('rejects an empty bearer token', async () => {
    const service = await makeService();
    expect(service.authenticate('Bearer ')).toEqual({ authenticated: false });
  });

  it('rejects every token when no tokens are configured', async () => {
    const warnSpy = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const service = await makeService({});
    expect(service.authenticate('Bearer bbl-secret')).toEqual({
      authenticated: false,
    });
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('ignores an env var configured to an empty string', async () => {
    const service = await makeService({
      API_TOKEN_IMPORT_BBL: '',
      API_TOKEN_IMPORT_TP: 'tp-secret',
      API_TOKEN_IMPORT_MANUAL: 'manual-secret',
    });
    expect(service.authenticate('Bearer ')).toEqual({ authenticated: false });
    expect(service.authenticate('Bearer tp-secret')).toEqual({
      authenticated: true,
      callerName: 'import-tp',
    });
  });
});
