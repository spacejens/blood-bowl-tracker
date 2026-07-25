import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock } from 'vitest-mock-extended';

import { ImportBblConfigService } from '../config/import-bbl-config.service';
import { LeagueConfigService } from './league-config.service';

async function makeService(leagues: unknown): Promise<LeagueConfigService> {
  const config = mock<ImportBblConfigService>();
  config.get.mockImplementation((key: string) =>
    key === 'leagues' ? leagues : undefined,
  );
  const moduleRef = await Test.createTestingModule({
    providers: [
      LeagueConfigService,
      { provide: ImportBblConfigService, useValue: config },
    ],
  }).compile();
  return moduleRef.get(LeagueConfigService);
}

describe('LeagueConfigService', () => {
  it('returns every configured league name in order', async () => {
    const leagues = [
      { leagueName: 'tLoEG', eras: [] },
      { leagueName: 'GBBL', eras: [] },
    ];
    const service = await makeService(leagues);
    expect(service.getLeagueNames()).toEqual(['tLoEG', 'GBBL']);
  });

  it('throws when leagues is not set', async () => {
    const service = await makeService(undefined);
    expect(() => service.getLeagueNames()).toThrow(
      'leagues is not set in import-bbl-config.json5',
    );
  });

  it('throws when leagues is empty', async () => {
    const service = await makeService([]);
    expect(() => service.getLeagueNames()).toThrow('non-empty');
  });

  it('throws when a league has an empty leagueName', async () => {
    const leagues = [{ leagueName: '', eras: [] }];
    const service = await makeService(leagues);
    expect(() => service.getLeagueNames()).toThrow('leagues[0].leagueName');
  });

  it('throws when two leagues share a name', async () => {
    const leagues = [
      { leagueName: 'tLoEG', eras: [] },
      { leagueName: 'tLoEG', eras: [] },
    ];
    const service = await makeService(leagues);
    expect(() => service.getLeagueNames()).toThrow(/tLoEG/);
  });
});
