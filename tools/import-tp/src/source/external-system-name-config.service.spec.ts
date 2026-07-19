import { describe, expect, it } from 'vitest';

import type { ImportTpConfigService } from '../config/import-tp-config.service';
import { ExternalSystemNameConfigService } from './external-system-name-config.service';

function makeService(
  name: string | undefined,
): ExternalSystemNameConfigService {
  const config = {
    get: (_key: string) => name,
  } as unknown as ImportTpConfigService;
  return new ExternalSystemNameConfigService(config);
}

describe('ExternalSystemNameConfigService', () => {
  it('returns "TP" when externalSystemName is not set', () => {
    expect(makeService(undefined).getTpSystemName()).toBe('TP');
  });

  it('returns "TP" when externalSystemName is empty or whitespace', () => {
    expect(makeService('').getTpSystemName()).toBe('TP');
    expect(makeService('   ').getTpSystemName()).toBe('TP');
  });

  it('returns the configured value when externalSystemName is set', () => {
    expect(makeService('MyTp').getTpSystemName()).toBe('MyTp');
  });
});
