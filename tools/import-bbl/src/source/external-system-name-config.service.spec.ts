import { describe, expect, it } from 'vitest';

import type { ImportBblConfigService } from '../config/import-bbl-config.service';
import { ExternalSystemNameConfigService } from './external-system-name-config.service';

function makeService(
  name: string | undefined,
): ExternalSystemNameConfigService {
  const config = {
    get: (_key: string) => name,
  } as unknown as ImportBblConfigService;
  return new ExternalSystemNameConfigService(config);
}

describe('ExternalSystemNameConfigService', () => {
  it('returns "BBL" when externalSystemName is not set', () => {
    expect(makeService(undefined).getBblSystemName()).toBe('BBL');
  });

  it('returns "BBL" when externalSystemName is empty or whitespace', () => {
    expect(makeService('').getBblSystemName()).toBe('BBL');
    expect(makeService('   ').getBblSystemName()).toBe('BBL');
  });

  it('returns the configured value when externalSystemName is set', () => {
    expect(makeService('MyLeague').getBblSystemName()).toBe('MyLeague');
  });
});
