import { describe, expect, it } from 'vitest';

import type { ImportTpConfigService } from '../config/import-tp-config.service';
import { LeagueConfigService } from './league-config.service';

function makeService(league: unknown): LeagueConfigService {
  const config = {
    get: (key: string) => (key === 'league' ? league : undefined),
  } as unknown as ImportTpConfigService;
  return new LeagueConfigService(config);
}

describe('LeagueConfigService', () => {
  it('returns league.name when set', () => {
    expect(makeService({ name: 'tLoEGBBL' }).getLeagueName()).toBe('tLoEGBBL');
  });

  it('throws when league.name is missing', () => {
    expect(() => makeService({ eras: [] }).getLeagueName()).toThrow(
      'league.name is not set in import-tp-config.json5',
    );
  });

  it('throws when league is not set at all', () => {
    expect(() => makeService(undefined).getLeagueName()).toThrow(
      'league.name is not set in import-tp-config.json5',
    );
  });

  it('throws when league.name is an empty string', () => {
    expect(() => makeService({ name: '' }).getLeagueName()).toThrow(
      'league.name is not set in import-tp-config.json5',
    );
  });
});
