import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import { LeagueConfigService } from './league-config.service';

function makeService(value: string | undefined): LeagueConfigService {
  const configService = {
    get: (_key: string) => value,
  } as unknown as ConfigService;
  return new LeagueConfigService(configService);
}

describe('LeagueConfigService', () => {
  it('returns the configured league name', () => {
    const service = makeService('tLoEG');
    expect(service.getLeagueName()).toBe('tLoEG');
  });

  it('throws when BBL_LEAGUE_NAME is not set', () => {
    const service = makeService(undefined);
    expect(() => service.getLeagueName()).toThrow('BBL_LEAGUE_NAME');
  });
});
