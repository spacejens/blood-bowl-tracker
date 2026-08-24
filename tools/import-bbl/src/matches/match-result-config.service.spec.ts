import { ConfigErrorMessageService } from '@blood-bowl-tracker/import';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import type { EraConfig } from '../eras/era-config.service';
import { EraConfigService } from '../eras/era-config.service';
import { MatchResultConfigService } from './match-result-config.service';

function era(resultOverrides: unknown[]): EraConfig {
  return {
    identity: { name: 'First era', rulesSets: [] },
    dates: { startDate: '2000-01-01', autoAssignByDate: true },
    players: { autoAssignByPlayerId: true },
    matches: { resultOverrides },
  };
}

describe('MatchResultConfigService', () => {
  let service: MatchResultConfigService;
  let eraConfig: MockProxy<EraConfigService>;

  async function build(eras: EraConfig[]): Promise<void> {
    eraConfig = mock<EraConfigService>();
    eraConfig.getEras.mockReturnValue(eras);
    const moduleRef = await Test.createTestingModule({
      providers: [
        MatchResultConfigService,
        { provide: EraConfigService, useValue: eraConfig },
        // ConfigErrorMessageService is passed real, not mocked — pure, dependency-free, per CLAUDE.md.
        ConfigErrorMessageService,
      ],
    }).compile();
    service = moduleRef.get(MatchResultConfigService);
  }

  it('returns an empty map when no era configures overrides', async () => {
    await build([era([])]);
    expect(service.getResultOverrides().size).toBe(0);
  });

  it('maps a match id to a winning team code', async () => {
    await build([era([{ matchId: '1061', winnerTeamCode: 'sew' }])]);
    expect(service.getResultOverrides().get('1061')).toBe('sew');
  });

  it('maps the literal "draw" to null', async () => {
    await build([era([{ matchId: '1061', winnerTeamCode: 'draw' }])]);
    const overrides = service.getResultOverrides();
    expect(overrides.get('1061')).toBeNull();
    expect(overrides.has('1061')).toBe(true);
  });

  it('rejects a duplicate match id across eras', async () => {
    await build([
      era([{ matchId: '1061', winnerTeamCode: 'sew' }]),
      era([{ matchId: '1061', winnerTeamCode: 'vor' }]),
    ]);
    expect(() => service.getResultOverrides()).toThrow(
      /match id 1061 has a result override in more than one place/,
    );
  });

  it('rejects a non-object entry', async () => {
    await build([era(['nope'])]);
    expect(() => service.getResultOverrides()).toThrow(
      /must be an object of the form \{ matchId, winnerTeamCode \}/,
    );
  });

  it('rejects a blank matchId', async () => {
    await build([era([{ matchId: '  ', winnerTeamCode: 'sew' }])]);
    expect(() => service.getResultOverrides()).toThrow(
      /matchId must be a non-empty string/,
    );
  });

  it('rejects a blank winnerTeamCode', async () => {
    await build([era([{ matchId: '1061', winnerTeamCode: '' }])]);
    expect(() => service.getResultOverrides()).toThrow(
      /winnerTeamCode must be a non-empty string/,
    );
  });
});
