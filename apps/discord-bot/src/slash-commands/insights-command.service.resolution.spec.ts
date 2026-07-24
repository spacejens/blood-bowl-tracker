import { afterEach, describe, expect, it, vi } from 'vitest';

import { INSIGHTS_UNMATCHED_CATEGORY_MESSAGE } from '../error-messages';
import {
  chatInput,
  makeService,
} from './insights-command.service.test-helpers';

describe('InsightsCommandService — fact-path resolution', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves an exact leaf path to that fact, suffixed with "All time" when no era is given', async () => {
    const { service, factTreeDeps } = await makeService();
    const result = await service.execute(
      chatInput('coach.toplist.matches.played'),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vitest-mock-extended mock method, not a real bound method
    expect(factTreeDeps.coachToplist.resolveMatchesPlayed).toHaveBeenCalledWith(
      { leagueId: undefined, eraId: undefined, competitionId: undefined },
    );
    expect(result).toEqual({
      embeds: [
        {
          title: 'Coaches by matches played — All time',
          description: '1. Roze Madder — 9',
        },
      ],
      components: [],
    });
  });

  it('suffixes eras.list with the league scope when no league is explicitly given', async () => {
    const { service, factTreeDeps } = await makeService();
    const result = await service.execute(chatInput('eras.list'));
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vitest-mock-extended mock method, not a real bound method
    expect(factTreeDeps.erasList.resolve).toHaveBeenCalledWith({
      leagueId: undefined,
      eraId: undefined,
      competitionId: undefined,
    });
    expect(result).toEqual({
      embeds: [
        {
          title: 'Eras — All time',
          description: expect.any(String) as unknown,
        },
      ],
    });
  });

  it('returns the apothecary fallback for an unknown path', async () => {
    const { service } = await makeService();
    const result = await service.execute(chatInput('coach.nope'));
    expect(result).toBe(INSIGHTS_UNMATCHED_CATEGORY_MESSAGE);
  });

  it('resolves player.toplist.mvps with no era, suffixed with "All time"', async () => {
    const { service, factTreeDeps } = await makeService();
    const result = await service.execute(chatInput('player.toplist.mvps'));
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vitest-mock-extended mock method, not a real bound method
    expect(factTreeDeps.playerToplist.resolveMvps).toHaveBeenCalledWith({
      leagueId: undefined,
      eraId: undefined,
      competitionId: undefined,
    });
    expect(result).toEqual({
      embeds: [
        {
          title: 'Players by MVP awards — All time',
          description: '1. Griff Oberwald — 7',
        },
      ],
      components: [],
    });
  });

  it('passes a string reply through unchanged (e.g. a timeout fallback message from the resolved fact)', async () => {
    const { service, factTreeDeps, eras } = await makeService();
    eras.findById.mockResolvedValue({ id: 20, name: 'BB2020' });
    const TIMEOUT_STAND_IN = 'The commentators fell asleep mid-sentence.';
    factTreeDeps.coachToplist.resolveMatchesPlayed.mockResolvedValue(
      TIMEOUT_STAND_IN,
    );

    const result = await service.execute(
      chatInput('coach.toplist.matches.played', { era: '20' }),
    );

    // A string reply (as a real fact service returns on its own timeout
    // fallback) is passed through verbatim, never wrapped/suffixed.
    expect(result).toBe(TIMEOUT_STAND_IN);
  });

  it('passes a reply with an empty embeds array through unchanged', async () => {
    const { service } = await makeService();
    const reply = { embeds: [] };

    const result = (
      service as unknown as {
        applyTitleSuffix: (reply: unknown, suffix: string) => unknown;
      }
    ).applyTitleSuffix(reply, 'BB2020');

    expect(result).toBe(reply);
  });

  it('resolves player.toplist.completions with no era, suffixed with "All time"', async () => {
    const { service, factTreeDeps } = await makeService();
    const result = await service.execute(
      chatInput('player.toplist.completions'),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vitest-mock-extended mock method, not a real bound method
    expect(factTreeDeps.playerToplist.resolveCompletions).toHaveBeenCalledWith({
      leagueId: undefined,
      eraId: undefined,
      competitionId: undefined,
    });
    expect(result).toEqual({
      embeds: [
        {
          title: 'Players by completions — All time',
          description: '1. Griff Oberwald — 6',
        },
      ],
      components: [],
    });
  });

  it('resolves team.toplist.deflections with no era, suffixed with "All time"', async () => {
    const { service, factTreeDeps } = await makeService();
    const result = await service.execute(chatInput('team.toplist.deflections'));
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vitest-mock-extended mock method, not a real bound method
    expect(factTreeDeps.teamToplist.resolveDeflections).toHaveBeenCalledWith({
      leagueId: undefined,
      eraId: undefined,
      competitionId: undefined,
    });
    expect(result).toEqual({
      embeds: [
        {
          title: 'Teams by deflections — All time',
          description: '1. 40 grinders — 4',
        },
      ],
      components: [],
    });
  });

  it('resolves player.toplist.sent_off with no era, suffixed with "All time"', async () => {
    const { service, factTreeDeps } = await makeService();
    const result = await service.execute(chatInput('player.toplist.sent_off'));
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vitest-mock-extended mock method, not a real bound method
    expect(factTreeDeps.playerToplist.resolveTimesSentOff).toHaveBeenCalledWith(
      { leagueId: undefined, eraId: undefined, competitionId: undefined },
    );
    expect(result).toEqual({
      embeds: [
        {
          title: 'Players by times sent off — All time',
          description: '1. Morg n Thorg — 5',
        },
      ],
      components: [],
    });
  });

  it('resolves team.toplist.deaths.suffered with no era, suffixed with "All time"', async () => {
    const { service, factTreeDeps } = await makeService();
    const result = await service.execute(
      chatInput('team.toplist.deaths.suffered'),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vitest-mock-extended mock method, not a real bound method
    expect(factTreeDeps.teamToplist.resolveDeathsSuffered).toHaveBeenCalledWith(
      { leagueId: undefined, eraId: undefined, competitionId: undefined },
    );
    expect(result).toEqual({
      embeds: [
        {
          title: 'Teams by deaths suffered — All time',
          description: '1. 40 grinders — 2',
        },
      ],
      components: [],
    });
  });
});
