import { describe, expect, it } from 'vitest';

import type { ImportBblConfigService } from '../config/import-bbl-config.service';
import { LeagueConfigService } from './league-config.service';

function makeService(name: string | undefined): LeagueConfigService {
  const config = {
    get: (_key: string) => name,
  } as unknown as ImportBblConfigService;
  return new LeagueConfigService(config);
}

describe('LeagueConfigService', () => {
  it('returns the configured league name', () => {
    const service = makeService('tLoEG');
    expect(service.getLeagueName()).toBe('tLoEG');
  });

  it('throws when leagueName is not set', () => {
    const service = makeService(undefined);
    expect(() => service.getLeagueName()).toThrow(
      'leagueName is not set in import-bbl-config.json5',
    );
  });
});
