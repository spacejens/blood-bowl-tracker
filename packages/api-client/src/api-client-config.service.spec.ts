import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ApiClientConfigService } from './api-client-config.service';

describe('ApiClientConfigService', () => {
  let service: ApiClientConfigService;
  let config: MockProxy<ConfigService>;

  beforeEach(async () => {
    config = mock<ConfigService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ApiClientConfigService,
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    service = moduleRef.get(ApiClientConfigService);
  });

  it('returns the configured API_BASE_URL', () => {
    vi.mocked(config.get).mockReturnValue('http://prod.example.com');
    expect(service.getApiBaseUrl()).toBe('http://prod.example.com');
  });

  it('defaults to http://localhost:3000 when API_BASE_URL is not set', () => {
    // ApiClientConfigService calls configService.get('API_BASE_URL', 'http://localhost:3000'),
    // relying on ConfigService's own default-value behaviour. A mocked ConfigService.get
    // does not apply that default itself, so this makes the mock echo back whatever
    // default value it was called with, mirroring the real fallback behaviour, and then
    // asserts the service actually requested the expected key and default.
    vi.mocked(config.get).mockImplementation(
      (_key: string, defaultValue?: string) => defaultValue,
    );
    expect(service.getApiBaseUrl()).toBe('http://localhost:3000');
    expect(config.get).toHaveBeenCalledWith(
      'API_BASE_URL',
      'http://localhost:3000',
    );
  });
});
