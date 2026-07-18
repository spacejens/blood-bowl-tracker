import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  COACH_TOPLIST_TIMEOUT_MESSAGE,
  ERAS_LIST_NO_DATA_MESSAGE,
  INSIGHTS_UNMATCHED_CATEGORY_MESSAGE,
} from '../error-messages';
import {
  chatInput,
  makeService,
} from './insights-command.service.test-helpers';

describe('InsightsCommandService — fact-path resolution', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('resolves an exact leaf path to that fact, suffixed with "All time" when no era is given', async () => {
    const { service, coaches } = makeService();
    const result = await service.execute(
      chatInput('coach.toplist.matches.played'),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock, not a real bound method
    expect(coaches.countMatchesPlayedByCoach).toHaveBeenCalled();
    expect(result).toEqual({
      embeds: [
        {
          title: 'Coaches by matches played — All time',
          description: '1. Roze Madder — 9',
        },
      ],
    });
  });

  it('does not suffix a non-era-supporting fact (eras.list) when no era is given', async () => {
    const { service } = makeService();
    const result = await service.execute(chatInput('eras.list'));
    expect(result).toEqual({
      embeds: [
        {
          title: 'Eras',
          description: ERAS_LIST_NO_DATA_MESSAGE,
        },
      ],
    });
  });

  it('returns the apothecary fallback for an unknown path', async () => {
    const { service } = makeService();
    const result = await service.execute(chatInput('coach.nope'));
    expect(result).toBe(INSIGHTS_UNMATCHED_CATEGORY_MESSAGE);
  });

  it('resolves player.toplist.mvps with no era, suffixed with "All time"', async () => {
    const { service, players } = makeService();
    const result = await service.execute(chatInput('player.toplist.mvps'));
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(players.countMvpAwardsByPlayer).toHaveBeenCalled();
    expect(result).toEqual({
      embeds: [
        {
          title: 'Players by MVP awards — All time',
          description: '1. Griff Oberwald — 7',
        },
      ],
    });
  });

  it('passes the per-fact timeout message through unchanged when an era is given', async () => {
    vi.useFakeTimers();
    try {
      const { service, coaches, eras } = makeService();
      (eras.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 20,
        name: 'BB2020',
      });
      (
        coaches.countMatchesPlayedByCoach as ReturnType<typeof vi.fn>
      ).mockReturnValue(new Promise(() => {}));

      const promise = service.execute(
        chatInput('coach.toplist.matches.played', '20'),
      );
      await vi.advanceTimersByTimeAsync(2000);

      await expect(promise).resolves.toBe(COACH_TOPLIST_TIMEOUT_MESSAGE);
    } finally {
      vi.useRealTimers();
    }
  });

  it('passes a reply with an empty embeds array through unchanged', () => {
    const { service } = makeService();
    const reply = { embeds: [] };

    const result = (
      service as unknown as {
        applyTitleSuffix: (reply: unknown, suffix: string) => unknown;
      }
    ).applyTitleSuffix(reply, 'BB2020');

    expect(result).toBe(reply);
  });

  it('resolves player.toplist.completions with no era, suffixed with "All time"', async () => {
    const { service, players } = makeService();
    const result = await service.execute(
      chatInput('player.toplist.completions'),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(players.countCompletionsByPlayer).toHaveBeenCalled();
    expect(result).toEqual({
      embeds: [
        {
          title: 'Players by completions — All time',
          description: '1. Griff Oberwald — 6',
        },
      ],
    });
  });

  it('resolves team.toplist.deflections with no era, suffixed with "All time"', async () => {
    const { service, teams } = makeService();
    const result = await service.execute(chatInput('team.toplist.deflections'));
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(teams.countDeflectionsByTeam).toHaveBeenCalled();
    expect(result).toEqual({
      embeds: [
        {
          title: 'Teams by deflections — All time',
          description: '1. 40 grinders — 4',
        },
      ],
    });
  });

  it('resolves player.toplist.sent_off with no era, suffixed with "All time"', async () => {
    const { service, players } = makeService();
    const result = await service.execute(chatInput('player.toplist.sent_off'));
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(players.countTimesSentOffByPlayer).toHaveBeenCalled();
    expect(result).toEqual({
      embeds: [
        {
          title: 'Players by times sent off — All time',
          description: '1. Morg n Thorg — 5',
        },
      ],
    });
  });

  it('resolves team.toplist.deaths.suffered with no era, suffixed with "All time"', async () => {
    const { service, teams } = makeService();
    const result = await service.execute(
      chatInput('team.toplist.deaths.suffered'),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vi.fn() mock
    expect(teams.countDeathsSufferedByTeam).toHaveBeenCalled();
    expect(result).toEqual({
      embeds: [
        {
          title: 'Teams by deaths suffered — All time',
          description: '1. 40 grinders — 2',
        },
      ],
    });
  });
});
