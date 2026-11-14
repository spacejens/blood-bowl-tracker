import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { DiscordRestService } from '../discord-rest/discord-rest.service';
import { ReadTpFeedHistoryService } from './read-tp-feed-history.service';
import { SnowflakeOrderService } from './snowflake-order.service';
import {
  TpFeedHistoryIndex,
  TpFeedHistoryIndexService,
} from './tp-feed-history-index.service';
import {
  TpFeedHistoryState,
  TpFeedHistoryStoreService,
} from './tp-feed-history-store.service';
import type { TpFeedMessage } from './tp-feed-message.schema';

const CHANNEL = '222';
const DATA_DIR = '/repo/tools/production-ops-cli/data/tp-feed-222';
const EMPTY_INDEX: TpFeedHistoryIndex = { reports: {}, unparsed: [] };

/** `count` messages, newest first as Discord returns them. */
function messages(newest: number, count: number): TpFeedMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    id: String(newest - i),
    timestamp: '2026-01-01T00:00:00.000+00:00',
    embeds: [],
  }));
}

function state(overrides: Partial<TpFeedHistoryState>): TpFeedHistoryState {
  return {
    guildId: '111',
    newestId: null,
    oldestId: null,
    reachedStart: false,
    ...overrides,
  };
}

describe('ReadTpFeedHistoryService', () => {
  let service: ReadTpFeedHistoryService;
  let discordRest: MockProxy<DiscordRestService>;
  let store: MockProxy<TpFeedHistoryStoreService>;
  let index: MockProxy<TpFeedHistoryIndexService>;

  beforeEach(async () => {
    discordRest = mock<DiscordRestService>();
    store = mock<TpFeedHistoryStoreService>();
    index = mock<TpFeedHistoryIndexService>();
    store.readState.mockResolvedValue(null);
    store.readMessages.mockResolvedValue([]);
    store.directory.mockResolvedValue(DATA_DIR);
    store.saveMessage.mockResolvedValue(true);
    index.isAdvancement.mockReturnValue(false);
    index.build.mockReturnValue(EMPTY_INDEX);
    discordRest.getChannel.mockResolvedValue({ id: CHANNEL, guild_id: '111' });

    // SnowflakeOrderService is pure and dependency-free, so it is passed
    // real (CLAUDE.md's pure decision-service carve-out).
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReadTpFeedHistoryService,
        SnowflakeOrderService,
        { provide: DiscordRestService, useValue: discordRest },
        { provide: TpFeedHistoryStoreService, useValue: store },
        { provide: TpFeedHistoryIndexService, useValue: index },
      ],
    }).compile();
    service = moduleRef.get(ReadTpFeedHistoryService);
  });

  describe('input validation', () => {
    it('rejects a non-numeric channel id before touching Discord or the disk', async () => {
      await expect(service.run('abc')).rejects.toThrow(/snowflake/);
      expect(store.readState).not.toHaveBeenCalled();
      expect(discordRest.getChannel).not.toHaveBeenCalled();
    });

    it.each([0, -1, 2.5, Number.NaN])(
      'rejects max pages %s before touching Discord or the disk',
      async (maxPages) => {
        await expect(service.run(CHANNEL, maxPages)).rejects.toThrow(
          /max pages must be a positive integer/,
        );
        expect(store.readState).not.toHaveBeenCalled();
      },
    );
  });

  it('reads a channel from its newest message back to its start on a first run', async () => {
    discordRest.getRecentMessages
      .mockResolvedValueOnce(messages(1100, 100))
      .mockResolvedValueOnce(messages(1000, 50));

    const summary = await service.run(CHANNEL);

    expect(discordRest.getRecentMessages.mock.calls).toEqual([
      [CHANNEL, 100, undefined],
      [CHANNEL, 100, '1001'],
    ]);
    expect(discordRest.getMessagesAfter).not.toHaveBeenCalled();
    expect(store.writeState).toHaveBeenLastCalledWith(
      CHANNEL,
      state({ newestId: '1100', oldestId: '951', reachedStart: true }),
    );
    expect(summary).toEqual({
      channelId: CHANNEL,
      dataDir: DATA_DIR,
      pagesFetched: 2,
      messagesSeen: 150,
      newReports: 0,
      unparsed: 0,
      reachedStart: true,
      stoppedByError: null,
    });
  });

  it('saves the state after every page', async () => {
    discordRest.getRecentMessages
      .mockResolvedValueOnce(messages(1100, 100))
      .mockResolvedValueOnce([]);

    await service.run(CHANNEL);

    expect(store.writeState.mock.calls).toEqual([
      [CHANNEL, state({ newestId: '1100', oldestId: '1001' })],
      [
        CHANNEL,
        state({ newestId: '1100', oldestId: '1001', reachedStart: true }),
      ],
    ]);
  });

  it('marks an empty channel as read to its start', async () => {
    discordRest.getRecentMessages.mockResolvedValueOnce([]);

    const summary = await service.run(CHANNEL);

    expect(store.writeState).toHaveBeenLastCalledWith(
      CHANNEL,
      state({ reachedStart: true }),
    );
    expect(summary.reachedStart).toBe(true);
  });

  it('refuses a channel outside a server, writing nothing', async () => {
    discordRest.getChannel.mockResolvedValue({ id: CHANNEL });

    await expect(service.run(CHANNEL)).rejects.toThrow(/not a server channel/);
    expect(store.writeState).not.toHaveBeenCalled();
    expect(store.writeIndex).not.toHaveBeenCalled();
  });

  it('resumes from saved state: catches up on newer messages, then continues backwards', async () => {
    store.readState.mockResolvedValue(
      state({ newestId: '500', oldestId: '300' }),
    );
    discordRest.getMessagesAfter.mockResolvedValueOnce(messages(502, 2));
    discordRest.getRecentMessages.mockResolvedValueOnce([]);

    await service.run(CHANNEL);

    expect(discordRest.getChannel).not.toHaveBeenCalled();
    expect(discordRest.getMessagesAfter).toHaveBeenCalledWith(
      CHANNEL,
      100,
      '500',
    );
    expect(discordRest.getRecentMessages).toHaveBeenCalledWith(
      CHANNEL,
      100,
      '300',
    );
    expect(store.writeState).toHaveBeenLastCalledWith(
      CHANNEL,
      state({ newestId: '502', oldestId: '300', reachedStart: true }),
    );
  });

  it('keeps catching up while pages of newer messages come back full', async () => {
    store.readState.mockResolvedValue(
      state({ newestId: '500', oldestId: '1', reachedStart: true }),
    );
    discordRest.getMessagesAfter
      .mockResolvedValueOnce(messages(600, 100))
      .mockResolvedValueOnce([]);

    await service.run(CHANNEL);

    expect(discordRest.getMessagesAfter.mock.calls).toEqual([
      [CHANNEL, 100, '500'],
      [CHANNEL, 100, '600'],
    ]);
    expect(discordRest.getRecentMessages).not.toHaveBeenCalled();
    expect(store.writeState).toHaveBeenLastCalledWith(
      CHANNEL,
      state({ newestId: '600', oldestId: '1', reachedStart: true }),
    );
  });

  it('starts over when the saved state has fetched nothing yet', async () => {
    store.readState.mockResolvedValue(state({ reachedStart: true }));
    discordRest.getRecentMessages.mockResolvedValueOnce([]);

    await service.run(CHANNEL);

    expect(discordRest.getChannel).toHaveBeenCalledWith(CHANNEL);
    expect(discordRest.getRecentMessages).toHaveBeenCalledWith(
      CHANNEL,
      100,
      undefined,
    );
  });

  it('stops after max pages without reaching the start', async () => {
    discordRest.getRecentMessages.mockResolvedValue(messages(1100, 100));

    const summary = await service.run(CHANNEL, 1);

    expect(discordRest.getRecentMessages).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({ pagesFetched: 1, reachedStart: false });
  });

  it('counts catch-up pages towards max pages', async () => {
    store.readState.mockResolvedValue(
      state({ newestId: '500', oldestId: '300' }),
    );
    discordRest.getMessagesAfter.mockResolvedValue(messages(600, 100));

    await service.run(CHANNEL, 2);

    expect(discordRest.getMessagesAfter).toHaveBeenCalledTimes(2);
    expect(discordRest.getRecentMessages).not.toHaveBeenCalled();
  });

  it('saves only advancement messages and counts only newly saved ones', async () => {
    const page = messages(3, 3);
    discordRest.getRecentMessages.mockResolvedValueOnce(page);
    index.isAdvancement
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    store.saveMessage.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const summary = await service.run(CHANNEL);

    expect(store.saveMessage.mock.calls).toEqual([
      [CHANNEL, page[0]],
      [CHANNEL, page[2]],
    ]);
    expect(summary).toMatchObject({ messagesSeen: 3, newReports: 1 });
  });

  it('stops cleanly when a page fails, keeping the state of the pages before it', async () => {
    discordRest.getRecentMessages
      .mockResolvedValueOnce(messages(1100, 100))
      .mockRejectedValueOnce(new Error('Discord API request failed: 429'));

    const summary = await service.run(CHANNEL);

    expect(store.writeState).toHaveBeenCalledTimes(1);
    expect(store.writeState).toHaveBeenLastCalledWith(
      CHANNEL,
      state({ newestId: '1100', oldestId: '1001' }),
    );
    expect(store.writeIndex).toHaveBeenCalled();
    expect(summary).toMatchObject({
      pagesFetched: 1,
      reachedStart: false,
      stoppedByError: 'Discord API request failed: 429',
    });
  });

  it('describes a failure that is not an Error', async () => {
    discordRest.getRecentMessages.mockRejectedValueOnce('socket hang up');

    const summary = await service.run(CHANNEL);

    expect(summary.stoppedByError).toBe('socket hang up');
  });

  it('stops cleanly on a page of an unexpected shape', async () => {
    discordRest.getRecentMessages.mockResolvedValueOnce([{ id: 'x' }]);

    const summary = await service.run(CHANNEL);

    expect(summary.stoppedByError).toMatch(/unexpected shape/);
    expect(store.writeState).not.toHaveBeenCalled();
  });

  it('stops when a catch-up page does not advance the cursor', async () => {
    store.readState.mockResolvedValue(
      state({ newestId: '500', oldestId: '300', reachedStart: true }),
    );
    discordRest.getMessagesAfter.mockResolvedValueOnce(messages(500, 100));

    const summary = await service.run(CHANNEL);

    expect(discordRest.getMessagesAfter).toHaveBeenCalledTimes(1);
    expect(store.writeState).not.toHaveBeenCalled();
    expect(summary.stoppedByError).toMatch(/does not move past after=500/);
    expect(store.writeIndex).toHaveBeenCalled();
  });

  it('stops when a backwards page does not advance the cursor', async () => {
    store.readState.mockResolvedValue(
      state({ newestId: '500', oldestId: '300' }),
    );
    discordRest.getMessagesAfter.mockResolvedValueOnce([]);
    discordRest.getRecentMessages.mockResolvedValueOnce(messages(400, 100));

    const summary = await service.run(CHANNEL);

    expect(discordRest.getRecentMessages).toHaveBeenCalledTimes(1);
    expect(store.writeState).not.toHaveBeenCalled();
    expect(summary.stoppedByError).toMatch(/does not move past before=300/);
    expect(summary.reachedStart).toBe(false);
    expect(store.writeIndex).toHaveBeenCalled();
  });

  it('advances both cursors correctly from a page in ascending order', async () => {
    store.readState.mockResolvedValue(
      state({ newestId: '500', oldestId: '300' }),
    );
    discordRest.getMessagesAfter
      .mockResolvedValueOnce(messages(600, 100).reverse())
      .mockResolvedValueOnce([]);
    discordRest.getRecentMessages.mockResolvedValueOnce(
      messages(299, 2).reverse(),
    );

    await service.run(CHANNEL);

    expect(discordRest.getMessagesAfter).toHaveBeenLastCalledWith(
      CHANNEL,
      100,
      '600',
    );
    expect(store.writeState).toHaveBeenLastCalledWith(
      CHANNEL,
      state({ newestId: '600', oldestId: '298', reachedStart: true }),
    );
  });

  it('does not read backwards after a failed catch-up', async () => {
    store.readState.mockResolvedValue(
      state({ newestId: '500', oldestId: '300' }),
    );
    discordRest.getMessagesAfter.mockRejectedValueOnce(new Error('boom'));

    const summary = await service.run(CHANNEL);

    expect(discordRest.getRecentMessages).not.toHaveBeenCalled();
    expect(summary.stoppedByError).toBe('boom');
  });

  it('rebuilds the index from every saved message and reports the unparsed count', async () => {
    const saved = messages(7, 2);
    const built: TpFeedHistoryIndex = {
      reports: {},
      unparsed: [{ reason: 'r', messageId: '7', link: 'l' }],
    };
    store.readMessages.mockResolvedValue(saved);
    index.build.mockReturnValue(built);
    discordRest.getRecentMessages.mockResolvedValueOnce([]);

    const summary = await service.run(CHANNEL);

    expect(index.build).toHaveBeenCalledWith({
      messages: saved,
      guildId: '111',
      channelId: CHANNEL,
    });
    expect(store.writeIndex).toHaveBeenCalledWith(CHANNEL, built);
    expect(summary.unparsed).toBe(1);
  });

  it('feeds the index only what the store holds, so overlapping pages and reruns add no duplicates', async () => {
    const overlapping = messages(1100, 100);
    const stored = messages(1100, 100).reverse();
    store.readState.mockResolvedValue(
      state({ newestId: '1050', oldestId: '1001' }),
    );
    // The catch-up page re-delivers messages that are already saved.
    discordRest.getMessagesAfter.mockResolvedValueOnce(overlapping);
    discordRest.getMessagesAfter.mockResolvedValueOnce([]);
    discordRest.getRecentMessages.mockResolvedValueOnce([]);
    index.isAdvancement.mockReturnValue(true);
    store.saveMessage.mockResolvedValue(false);
    store.readMessages.mockResolvedValue(stored);

    const summary = await service.run(CHANNEL);

    expect(summary.newReports).toBe(0);
    expect(index.build).toHaveBeenCalledTimes(1);
    const input = index.build.mock.calls[0][0];
    expect(input.messages).toBe(stored);
    expect(new Set(input.messages.map((m) => m.id)).size).toBe(
      input.messages.length,
    );
  });
});
