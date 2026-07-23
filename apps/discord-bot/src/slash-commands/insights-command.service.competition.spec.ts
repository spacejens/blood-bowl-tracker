import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  INSIGHTS_CATEGORY_UNSUPPORTED_FOR_COMPETITION_MESSAGE,
  INSIGHTS_COMPETITION_NOT_FOUND_MESSAGE,
  INSIGHTS_SCOPE_CONFLICT_MESSAGE,
} from '../error-messages';
import { TOPLIST_FETCH_LIMIT } from '../insights/leaderboard';
import {
  chatInput,
  makeService,
} from './insights-command.service.test-helpers';

describe('InsightsCommandService — competition scoping', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects a request that supplies both an era and a competition', async () => {
    const { service, eras, competitions } = makeService();
    const result = await service.execute(
      chatInput('coach.toplist.matches.played', {
        era: '20',
        competition: '30',
      }),
    );
    expect(result).toBe(INSIGHTS_SCOPE_CONFLICT_MESSAGE);
    // mutual exclusion is checked before any lookup
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(eras.findById).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(competitions.findById).not.toHaveBeenCalled();
  });

  it('rejects a competition id that does not resolve to a real competition', async () => {
    const { service, competitions } = makeService();
    (competitions.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined,
    );
    const result = await service.execute(
      chatInput('team.toplist.competitions.played', { competition: '999' }),
    );
    expect(result).toBe(INSIGHTS_COMPETITION_NOT_FOUND_MESSAGE);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(competitions.findById).toHaveBeenCalledWith(999);
  });

  it('scopes an in-scope category to the resolved competition and names it in the title', async () => {
    const { service, teams, competitions } = makeService();
    (competitions.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 30,
      name: 'Major Season 24',
      type: 'season',
      eraId: 5,
    });
    const result = await service.execute(
      chatInput('team.toplist.touchdowns.scored', { competition: '30' }),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(teams.countTouchdownsScoredByTeam).toHaveBeenCalledWith(
      { eraId: undefined, competitionId: 30 },
      TOPLIST_FETCH_LIMIT,
    );
    expect(result).toEqual(
      expect.objectContaining({
        embeds: [
          {
            title: 'Teams by touchdowns scored — Major Season 24',
            description: '1. 40 grinders — 15',
          },
        ],
        components: expect.any(Array) as unknown,
      }),
    );
  });

  it('rejects a competition on a category that does not support it (coach.toplist.competitions.played)', async () => {
    const { service, competitions } = makeService();
    (competitions.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 30,
      name: 'Major Season 24',
      type: 'season',
      eraId: 5,
    });
    const result = await service.execute(
      chatInput('coach.toplist.competitions.played', { competition: '30' }),
    );
    expect(result).toBe(INSIGHTS_CATEGORY_UNSUPPORTED_FOR_COMPETITION_MESSAGE);
  });

  it('rejects a competition on eras.list (not competition-supporting)', async () => {
    const { service, competitions } = makeService();
    (competitions.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 30,
      name: 'Major Season 24',
      type: 'season',
      eraId: 5,
    });
    const result = await service.execute(
      chatInput('eras.list', { competition: '30' }),
    );
    expect(result).toBe(INSIGHTS_CATEGORY_UNSUPPORTED_FOR_COMPETITION_MESSAGE);
  });

  it('restricts the random pick to competition-supporting leaves when a competition but no category is given', async () => {
    const { service, competitions } = makeService();
    (competitions.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 30,
      name: 'Major Season 24',
      type: 'season',
      eraId: 5,
    });
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    const result = await service.execute(
      chatInput(null, { competition: '30' }),
    );
    expect(result).not.toBe(
      INSIGHTS_CATEGORY_UNSUPPORTED_FOR_COMPETITION_MESSAGE,
    );
  });
});
