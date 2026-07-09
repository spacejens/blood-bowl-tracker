import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import { ExternalSystemNameConfigService } from './external-system-name-config.service';

function makeService(
  value: string | undefined,
): ExternalSystemNameConfigService {
  const configService = {
    get: (_key: string) => value,
  } as unknown as ConfigService;
  return new ExternalSystemNameConfigService(configService);
}

describe('ExternalSystemNameConfigService', () => {
  it('returns "BBL" when BBL_EXTERNAL_SYSTEM_NAME is not set', () => {
    expect(makeService(undefined).getBblSystemName()).toBe('BBL');
  });

  it('returns "BBL" when BBL_EXTERNAL_SYSTEM_NAME is empty or whitespace', () => {
    expect(makeService('').getBblSystemName()).toBe('BBL');
    expect(makeService('   ').getBblSystemName()).toBe('BBL');
  });

  it('returns the configured value when BBL_EXTERNAL_SYSTEM_NAME is set', () => {
    expect(makeService('MyLeague').getBblSystemName()).toBe('MyLeague');
  });
});
