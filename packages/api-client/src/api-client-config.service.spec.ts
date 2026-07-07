import { describe, it, expect } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { ApiClientConfigService } from './api-client-config.service';

describe('ApiClientConfigService', () => {
  it('returns the configured API_BASE_URL', () => {
    const configService = new ConfigService({
      API_BASE_URL: 'http://prod.example.com',
    });
    const service = new ApiClientConfigService(configService);
    expect(service.getApiBaseUrl()).toBe('http://prod.example.com');
  });

  it('defaults to http://localhost:3000 when API_BASE_URL is not set', () => {
    const configService = new ConfigService({});
    const service = new ApiClientConfigService(configService);
    expect(service.getApiBaseUrl()).toBe('http://localhost:3000');
  });
});
