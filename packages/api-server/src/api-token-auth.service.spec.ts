import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ApiTokenAuthService } from './api-token-auth.service';

describe('ApiTokenAuthService', () => {
  let config: MockProxy<ConfigService>;
  let service: ApiTokenAuthService;

  const tokens: Record<string, string | undefined> = {
    IMPORT_BBL_API_TOKEN: 'bbl-secret',
    IMPORT_TP_API_TOKEN: 'tp-secret',
    IMPORT_MANUAL_API_TOKEN: 'manual-secret',
  };

  /**
   * Compiles the subject over `configured`. The service reads its env vars
   * once at construction, so each describe below compiles it in its own
   * beforeEach with the tokens it needs.
   */
  async function compile(
    configured: Record<string, string | undefined>,
  ): Promise<ApiTokenAuthService> {
    config = mock<ConfigService>();
    vi.mocked(config.get).mockImplementation((key: string) => configured[key]);
    const moduleRef = await Test.createTestingModule({
      providers: [
        ApiTokenAuthService,
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    return moduleRef.get(ApiTokenAuthService);
  }

  describe('with every token configured', () => {
    beforeEach(async () => {
      service = await compile(tokens);
    });

    it.each([
      ['IMPORT_BBL_API_TOKEN', 'bbl-secret', 'import-bbl'],
      ['IMPORT_TP_API_TOKEN', 'tp-secret', 'import-tp'],
      ['IMPORT_MANUAL_API_TOKEN', 'manual-secret', 'import-manual'],
    ])(
      'authenticates the token from %s as caller %s',
      (_envVar, token, callerName) => {
        expect(service.authenticate(`Bearer ${token}`)).toEqual({
          authenticated: true,
          callerName,
        });
      },
    );

    it('rejects a missing Authorization header', () => {
      expect(service.authenticate(undefined)).toEqual({ authenticated: false });
    });

    it('rejects a header without the Bearer prefix', () => {
      expect(service.authenticate('bbl-secret')).toEqual({
        authenticated: false,
      });
    });

    it('rejects a Basic authorization header', () => {
      expect(service.authenticate('Basic YmJsLXNlY3JldA==')).toEqual({
        authenticated: false,
      });
    });

    it('rejects an unknown token of the same length as a configured one', () => {
      // Same length as 'bbl-secret', so the length pre-check passes and the
      // timing-safe comparison itself is what rejects it.
      expect(service.authenticate('Bearer xxx-xxxxxx')).toEqual({
        authenticated: false,
      });
    });

    it('rejects a token that is a prefix of a configured one', () => {
      expect(service.authenticate('Bearer bbl-')).toEqual({
        authenticated: false,
      });
    });

    it('rejects an empty bearer token', () => {
      expect(service.authenticate('Bearer ')).toEqual({ authenticated: false });
    });
  });

  describe('with no tokens configured', () => {
    let warnSpy: MockInstance;

    beforeEach(async () => {
      warnSpy = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      service = await compile({});
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it('rejects every token and warns once', () => {
      expect(service.authenticate('Bearer bbl-secret')).toEqual({
        authenticated: false,
      });
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('with one token configured to an empty string', () => {
    beforeEach(async () => {
      service = await compile({ ...tokens, IMPORT_BBL_API_TOKEN: '' });
    });

    it('ignores the empty one', () => {
      expect(service.authenticate('Bearer ')).toEqual({ authenticated: false });
      expect(service.authenticate('Bearer tp-secret')).toEqual({
        authenticated: true,
        callerName: 'import-tp',
      });
    });
  });
});
