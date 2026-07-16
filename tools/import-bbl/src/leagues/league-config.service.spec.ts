import { describe, expect, it } from 'vitest';

import type { ImportBblConfigService } from '../config/import-bbl-config.service';
import { LeagueConfigService } from './league-config.service';

function makeService(name: string | undefined): LeagueConfigService {
  const config = {
    get: (key: string) => (key === 'league' ? { leagueName: name } : undefined),
  } as unknown as ImportBblConfigService;
  return new LeagueConfigService(config);
}

describe('LeagueConfigService', () => {
  it('returns the configured league name', () => {
    expect(makeService('tLoEG').getLeagueName()).toBe('tLoEG');
  });

  it('throws when leagueName is not set', () => {
    expect(() => makeService(undefined).getLeagueName()).toThrow(
      'league.leagueName is not set in import-bbl-config.json5',
    );
  });
});
