import { describe, expect, it } from 'vitest';

import type { ImportBblConfigService } from '../config/import-bbl-config.service';
import { LeagueConfigService } from './league-config.service';

function makeService(leagues: unknown): LeagueConfigService {
  const config = {
    get: (key: string) => (key === 'leagues' ? leagues : undefined),
  } as unknown as ImportBblConfigService;
  return new LeagueConfigService(config);
}

describe('LeagueConfigService', () => {
  it('returns every configured league name in order', () => {
    const leagues = [
      { leagueName: 'tLoEG', eras: [] },
      { leagueName: 'GBBL', eras: [] },
    ];
    expect(makeService(leagues).getLeagueNames()).toEqual(['tLoEG', 'GBBL']);
  });

  it('throws when leagues is not set', () => {
    expect(() => makeService(undefined).getLeagueNames()).toThrow(
      'leagues is not set in import-bbl-config.json5',
    );
  });

  it('throws when leagues is empty', () => {
    expect(() => makeService([]).getLeagueNames()).toThrow('non-empty');
  });

  it('throws when a league has an empty leagueName', () => {
    const leagues = [{ leagueName: '', eras: [] }];
    expect(() => makeService(leagues).getLeagueNames()).toThrow(
      'leagues[0].leagueName',
    );
  });

  it('throws when two leagues share a name', () => {
    const leagues = [
      { leagueName: 'tLoEG', eras: [] },
      { leagueName: 'tLoEG', eras: [] },
    ];
    expect(() => makeService(leagues).getLeagueNames()).toThrow(/tLoEG/);
  });
});
