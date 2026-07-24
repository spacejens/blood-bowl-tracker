import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { ImportTpConfigService } from '../config/import-tp-config.service';
import { LeagueConfigService } from './league-config.service';

describe('LeagueConfigService', () => {
  let config: MockProxy<ImportTpConfigService>;
  let service: LeagueConfigService;

  beforeEach(async () => {
    config = mock<ImportTpConfigService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        LeagueConfigService,
        { provide: ImportTpConfigService, useValue: config },
      ],
    }).compile();
    service = moduleRef.get(LeagueConfigService);
  });

  function withLeague(league: unknown): void {
    config.get.mockImplementation((key: string) =>
      key === 'league' ? league : undefined,
    );
  }

  it('returns league.name when set', () => {
    withLeague({ name: 'tLoEGBBL' });
    expect(service.getLeagueName()).toBe('tLoEGBBL');
  });

  it('throws when league.name is missing', () => {
    withLeague({ eras: [] });
    expect(() => service.getLeagueName()).toThrow(
      'league.name is not set in import-tp-config.json5',
    );
  });

  it('throws when league is not set at all', () => {
    withLeague(undefined);
    expect(() => service.getLeagueName()).toThrow(
      'league.name is not set in import-tp-config.json5',
    );
  });

  it('throws when league.name is an empty string', () => {
    withLeague({ name: '' });
    expect(() => service.getLeagueName()).toThrow(
      'league.name is not set in import-tp-config.json5',
    );
  });
});
