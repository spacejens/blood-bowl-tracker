import { afterEach, describe, expect, it, vi } from 'vitest';

import { INSIGHTS_SCOPE_CONFLICT_MESSAGE } from '../error-messages';
import {
  chatInput,
  makeService,
} from './insights-command.service.test-helpers';

describe('InsightsCommandService — match category scoping', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects a request that supplies both a league and a match category', async () => {
    const { service, leagues } = await makeService();
    const result = await service.execute(
      chatInput('team.toplist.touchdowns.scored', {
        league: '9',
        matchCategory: 'season_final',
      }),
    );
    expect(result).toBe(INSIGHTS_SCOPE_CONFLICT_MESSAGE);
    expect(leagues.findById).not.toHaveBeenCalled();
  });

  it('rejects a request that supplies both an era and a match category', async () => {
    const { service, eras } = await makeService();
    const result = await service.execute(
      chatInput('team.toplist.touchdowns.scored', {
        era: '20',
        matchCategory: 'season_final',
      }),
    );
    expect(result).toBe(INSIGHTS_SCOPE_CONFLICT_MESSAGE);
    expect(eras.findById).not.toHaveBeenCalled();
  });

  it('rejects a request that supplies both a competition and a match category', async () => {
    const { service, competitions } = await makeService();
    const result = await service.execute(
      chatInput('team.toplist.touchdowns.scored', {
        competition: '30',
        matchCategory: 'season_final',
      }),
    );
    expect(result).toBe(INSIGHTS_SCOPE_CONFLICT_MESSAGE);
    expect(competitions.findById).not.toHaveBeenCalled();
  });

  it('rejects a request that supplies all four scope options', async () => {
    const { service } = await makeService();
    const result = await service.execute(
      chatInput('team.toplist.touchdowns.scored', {
        league: '9',
        era: '20',
        competition: '30',
        matchCategory: 'season_final',
      }),
    );
    expect(result).toBe(INSIGHTS_SCOPE_CONFLICT_MESSAGE);
  });
});
