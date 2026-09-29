import type { MessageHandler } from '@blood-bowl-tracker/discord-client';
import { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Message } from 'discord.js';
import { MessageFlags } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { DiscordBotConfigService } from '../discord-bot-config.service';
import type { TpFeedImportFailure } from './tp-feed-event';
import { TpFeedFormatterService } from './tp-feed-formatter.service';
import { TpFeedImportService } from './tp-feed-import.service';
import { TpFeedListenerService } from './tp-feed-listener.service';
import { TpFeedParserService } from './tp-feed-parser.service';

const IMPORT_FAILURE: TpFeedImportFailure = {
  failed: true,
  headline: 'TP import of team 1 failed',
  errors: ['Team: no coach'],
};
const SOURCE_CHANNEL = '910000000000000000';
const DEBUG_CHANNEL = '920000000000000000';
const MESSAGE_URL =
  'https://discord.com/channels/900000000000000000/910000000000000000/930000000000000000';
const PROCESSED_REACTION = '✔️';

/**
 * A fake discord.js message. Pass a `react` mock to assert on, or to make
 * reacting fail; each call otherwise gets its own fresh mock.
 */
function message(channelId: string, react = vi.fn()): Message {
  return { id: 'm1', channelId, url: MESSAGE_URL, react } as unknown as Message;
}

describe('TpFeedListenerService', () => {
  let service: TpFeedListenerService;
  let discordClient: DeepMockProxy<DiscordClientService>;
  let config: MockProxy<DiscordBotConfigService>;
  let parser: MockProxy<TpFeedParserService>;
  let formatter: MockProxy<TpFeedFormatterService>;
  let feedImport: MockProxy<TpFeedImportService>;

  /** The handler the service registered, for driving a fake messageCreate. */
  function registeredHandler(): MessageHandler {
    const call = discordClient.registerMessageHandler.mock.calls.at(0);
    if (!call) throw new Error('no message handler was registered');
    return call[0];
  }

  beforeEach(async () => {
    discordClient = mockDeep<DiscordClientService>();
    config = mock<DiscordBotConfigService>();
    parser = mock<TpFeedParserService>();
    formatter = mock<TpFeedFormatterService>();
    feedImport = mock<TpFeedImportService>();
    feedImport.enqueue.mockResolvedValue({ failed: false });
    formatter.formatImportFailure.mockReturnValue(
      'TP import of team 1 failed — https://tp/r/1',
    );
    config.getTpFeedSourceDiscordChannel.mockReturnValue(SOURCE_CHANNEL);
    config.getTpFeedDebugDiscordChannel.mockReturnValue(DEBUG_CHANNEL);
    parser.parse.mockReturnValue({
      status: 'event',
      event: {
        kind: 'hired',
        playerNumber: '3',
        playerName: 'Ragnfred Brownlock',
        position: 'Halfling Hefty',
        teamName: "Satan's Little Helpers",
        link: 'https://tp/r/1',
      },
    });
    formatter.format.mockReturnValue('Hired: #3 Ragnfred Brownlock');
    formatter.formatUnrecognized.mockReturnValue(
      `Unrecognized TP notification — ${MESSAGE_URL}`,
    );
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpFeedListenerService,
        { provide: DiscordClientService, useValue: discordClient },
        { provide: DiscordBotConfigService, useValue: config },
        { provide: TpFeedParserService, useValue: parser },
        { provide: TpFeedFormatterService, useValue: formatter },
        { provide: TpFeedImportService, useValue: feedImport },
      ],
    }).compile();
    service = moduleRef.get(TpFeedListenerService);
  });

  it('registers a message handler when a source channel is configured', () => {
    service.onModuleInit();

    expect(discordClient.registerMessageHandler).toHaveBeenCalledWith(
      expect.any(Function),
    );
  });

  it('never registers a handler when no source channel is configured', () => {
    config.getTpFeedSourceDiscordChannel.mockReturnValue(undefined);

    service.onModuleInit();

    expect(discordClient.registerMessageHandler).not.toHaveBeenCalled();
  });

  it('posts the formatted interpretation to the debug channel, then reacts', async () => {
    const react = vi.fn();
    service.onModuleInit();

    await registeredHandler()(message(SOURCE_CHANNEL, react));

    expect(parser.parse).toHaveBeenCalled();
    expect(formatter.format).toHaveBeenCalled();
    expect(discordClient.sendMessage).toHaveBeenCalledWith(DEBUG_CHANNEL, {
      content: 'Hired: #3 Ragnfred Brownlock',
      allowedMentions: { parse: [] },
      flags: [MessageFlags.SuppressEmbeds],
    });
    expect(react).toHaveBeenCalledWith(PROCESSED_REACTION);
  });

  it('ignores a message from any other channel without parsing or reacting', async () => {
    const react = vi.fn();
    service.onModuleInit();

    await registeredHandler()(message('999999999999999999', react));

    expect(parser.parse).not.toHaveBeenCalled();
    expect(discordClient.sendMessage).not.toHaveBeenCalled();
    expect(react).not.toHaveBeenCalled();
  });

  it('posts nothing but still reacts when the parser ignores the message', async () => {
    const react = vi.fn();
    parser.parse.mockReturnValue({ status: 'ignored' });
    service.onModuleInit();

    await registeredHandler()(message(SOURCE_CHANNEL, react));

    expect(formatter.format).not.toHaveBeenCalled();
    expect(formatter.formatUnrecognized).not.toHaveBeenCalled();
    expect(feedImport.enqueue).not.toHaveBeenCalled();
    expect(discordClient.sendMessage).not.toHaveBeenCalled();
    expect(config.getTpFeedDebugDiscordChannel).not.toHaveBeenCalled();
    expect(react).toHaveBeenCalledWith(PROCESSED_REACTION);
  });

  it('posts an unrecognized notice linking to the original message, but does not react', async () => {
    const react = vi.fn();
    parser.parse.mockReturnValue({ status: 'unrecognized' });
    service.onModuleInit();

    await registeredHandler()(message(SOURCE_CHANNEL, react));

    expect(formatter.formatUnrecognized).toHaveBeenCalledWith(MESSAGE_URL);
    expect(formatter.format).not.toHaveBeenCalled();
    expect(feedImport.enqueue).not.toHaveBeenCalled();
    expect(discordClient.sendMessage).toHaveBeenCalledWith(DEBUG_CHANNEL, {
      content: `Unrecognized TP notification — ${MESSAGE_URL}`,
      allowedMentions: { parse: [] },
      flags: [MessageFlags.SuppressEmbeds],
    });
    expect(react).not.toHaveBeenCalled();
  });

  it('logs and swallows a failure to post an unrecognized notice, and does not react', async () => {
    const react = vi.fn();
    const errorLog = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    parser.parse.mockReturnValue({ status: 'unrecognized' });
    discordClient.sendMessage.mockRejectedValue(new Error('channel gone'));
    service.onModuleInit();

    await expect(
      registeredHandler()(message(SOURCE_CHANNEL, react)),
    ).resolves.toBeUndefined();

    expect(errorLog).toHaveBeenCalledWith(
      'Failed to post TP feed message',
      expect.stringContaining('channel gone'),
    );
    expect(react).not.toHaveBeenCalled();
    errorLog.mockRestore();
  });

  it('posts nothing and does not react to an unrecognized message when no debug channel is configured', async () => {
    const react = vi.fn();
    parser.parse.mockReturnValue({ status: 'unrecognized' });
    config.getTpFeedDebugDiscordChannel.mockReturnValue(undefined);
    service.onModuleInit();

    await registeredHandler()(message(SOURCE_CHANNEL, react));

    expect(parser.parse).toHaveBeenCalled();
    expect(formatter.formatUnrecognized).not.toHaveBeenCalled();
    expect(feedImport.enqueue).not.toHaveBeenCalled();
    expect(discordClient.sendMessage).not.toHaveBeenCalled();
    expect(react).not.toHaveBeenCalled();
  });

  it('still parses and reacts but posts nothing when no debug channel is configured', async () => {
    const react = vi.fn();
    config.getTpFeedDebugDiscordChannel.mockReturnValue(undefined);
    service.onModuleInit();

    await registeredHandler()(message(SOURCE_CHANNEL, react));

    expect(parser.parse).toHaveBeenCalled();
    expect(feedImport.enqueue).toHaveBeenCalled();
    expect(discordClient.sendMessage).not.toHaveBeenCalled();
    expect(react).toHaveBeenCalledWith(PROCESSED_REACTION);
  });

  it('enqueues the parsed event before posting its description', async () => {
    const order: string[] = [];
    feedImport.enqueue.mockImplementation(() => {
      order.push('enqueue');
      return Promise.resolve({ failed: false });
    });
    discordClient.sendMessage.mockImplementation(() => {
      order.push('post');
      return Promise.resolve();
    });
    service.onModuleInit();

    await registeredHandler()(message(SOURCE_CHANNEL));

    expect(feedImport.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'hired', link: 'https://tp/r/1' }),
    );
    expect(order).toEqual(['enqueue', 'post']);
  });

  it('reacts only after the import has finished', async () => {
    let importFinished = false;
    let importFinishedWhenReacting: boolean | undefined;
    feedImport.enqueue.mockImplementation(async () => {
      await Promise.resolve();
      importFinished = true;
      return { failed: false };
    });
    const react = vi.fn((_emoji: string) => {
      importFinishedWhenReacting = importFinished;
    });
    service.onModuleInit();

    await registeredHandler()(message(SOURCE_CHANNEL, react));

    expect(importFinishedWhenReacting).toBe(true);
  });

  it('posts an import failure after the description, and does not react', async () => {
    const react = vi.fn();
    feedImport.enqueue.mockResolvedValue(IMPORT_FAILURE);
    service.onModuleInit();

    await registeredHandler()(message(SOURCE_CHANNEL, react));

    expect(formatter.formatImportFailure).toHaveBeenCalledWith(
      IMPORT_FAILURE,
      'https://tp/r/1',
    );
    expect(discordClient.sendMessage).toHaveBeenNthCalledWith(
      1,
      DEBUG_CHANNEL,
      expect.objectContaining({ content: 'Hired: #3 Ragnfred Brownlock' }),
    );
    expect(discordClient.sendMessage).toHaveBeenNthCalledWith(
      2,
      DEBUG_CHANNEL,
      {
        content: 'TP import of team 1 failed — https://tp/r/1',
        allowedMentions: { parse: [] },
        flags: [MessageFlags.SuppressEmbeds],
      },
    );
    expect(react).not.toHaveBeenCalled();
  });

  it("posts a merged burst's shared failure once, and reacts to none of its messages", async () => {
    const firstReact = vi.fn();
    const secondReact = vi.fn();
    parser.parse.mockReturnValue({
      status: 'event',
      event: { kind: 'competition-trophy', link: 'https://tp/c/awards' },
    });
    formatter.format.mockReturnValue('Competition trophy announced');
    feedImport.enqueue
      .mockResolvedValueOnce(IMPORT_FAILURE)
      .mockResolvedValueOnce({ ...IMPORT_FAILURE, alreadyReported: true });
    service.onModuleInit();

    await registeredHandler()(message(SOURCE_CHANNEL, firstReact));
    await registeredHandler()(message(SOURCE_CHANNEL, secondReact));

    expect(formatter.formatImportFailure).toHaveBeenCalledTimes(1);
    expect(discordClient.sendMessage).toHaveBeenCalledTimes(3);
    expect(discordClient.sendMessage).toHaveBeenLastCalledWith(
      DEBUG_CHANNEL,
      expect.objectContaining({ content: 'Competition trophy announced' }),
    );
    expect(firstReact).not.toHaveBeenCalled();
    expect(secondReact).not.toHaveBeenCalled();
  });

  it('still imports with no debug channel, posting nothing and not reacting on failure', async () => {
    const react = vi.fn();
    config.getTpFeedDebugDiscordChannel.mockReturnValue(undefined);
    feedImport.enqueue.mockResolvedValue(IMPORT_FAILURE);
    service.onModuleInit();

    await registeredHandler()(message(SOURCE_CHANNEL, react));

    expect(feedImport.enqueue).toHaveBeenCalled();
    expect(discordClient.sendMessage).not.toHaveBeenCalled();
    expect(react).not.toHaveBeenCalled();
  });

  it('does not react when the description post failed, even though the import succeeded', async () => {
    const react = vi.fn();
    const errorLog = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    discordClient.sendMessage.mockRejectedValue(new Error('channel gone'));
    service.onModuleInit();

    await registeredHandler()(message(SOURCE_CHANNEL, react));

    expect(feedImport.enqueue).toHaveBeenCalled();
    expect(react).not.toHaveBeenCalled();
    errorLog.mockRestore();
  });

  it('still posts the import failure, and does not react, when the description post failed too', async () => {
    const react = vi.fn();
    const errorLog = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    feedImport.enqueue.mockResolvedValue(IMPORT_FAILURE);
    discordClient.sendMessage
      .mockRejectedValueOnce(new Error('channel gone'))
      .mockResolvedValueOnce(undefined);
    service.onModuleInit();

    await registeredHandler()(message(SOURCE_CHANNEL, react));

    expect(discordClient.sendMessage).toHaveBeenCalledTimes(2);
    expect(discordClient.sendMessage).toHaveBeenNthCalledWith(
      2,
      DEBUG_CHANNEL,
      expect.objectContaining({
        content: 'TP import of team 1 failed — https://tp/r/1',
      }),
    );
    expect(react).not.toHaveBeenCalled();
    errorLog.mockRestore();
  });

  it('logs and swallows a failure to post an import failure, and does not react', async () => {
    const react = vi.fn();
    const errorLog = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    feedImport.enqueue.mockResolvedValue(IMPORT_FAILURE);
    discordClient.sendMessage
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('channel gone'));
    service.onModuleInit();

    await expect(
      registeredHandler()(message(SOURCE_CHANNEL, react)),
    ).resolves.toBeUndefined();

    expect(errorLog).toHaveBeenCalledWith(
      'Failed to post TP feed message',
      expect.stringContaining('channel gone'),
    );
    expect(react).not.toHaveBeenCalled();
    errorLog.mockRestore();
  });

  it('logs and swallows a failure to post, and does not react', async () => {
    const react = vi.fn();
    const errorLog = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    discordClient.sendMessage.mockRejectedValue(new Error('channel gone'));
    service.onModuleInit();

    await expect(
      registeredHandler()(message(SOURCE_CHANNEL, react)),
    ).resolves.toBeUndefined();

    expect(errorLog).toHaveBeenCalledWith(
      'Failed to post TP feed message',
      expect.any(String),
    );
    expect(react).not.toHaveBeenCalled();
    errorLog.mockRestore();
  });

  it('reacts only after the debug-channel post has completed', async () => {
    let postCompleted = false;
    let postCompletedWhenReacting: boolean | undefined;
    discordClient.sendMessage.mockImplementation(async () => {
      await Promise.resolve();
      postCompleted = true;
    });
    const react = vi.fn((_emoji: string) => {
      postCompletedWhenReacting = postCompleted;
    });
    service.onModuleInit();

    await registeredHandler()(message(SOURCE_CHANNEL, react));

    expect(react).toHaveBeenCalledWith(PROCESSED_REACTION);
    expect(postCompletedWhenReacting).toBe(true);
  });

  it('logs and swallows a failure to react', async () => {
    const react = vi.fn().mockRejectedValue(new Error('Unknown Message'));
    const errorLog = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    service.onModuleInit();

    await expect(
      registeredHandler()(message(SOURCE_CHANNEL, react)),
    ).resolves.toBeUndefined();

    expect(react).toHaveBeenCalledWith(PROCESSED_REACTION);
    expect(errorLog).toHaveBeenCalledWith(
      'Failed to react to TP feed message',
      expect.stringContaining('Unknown Message'),
    );
    errorLog.mockRestore();
  });

  it('logs a non-Error rejection from reacting as a string', async () => {
    const react = vi.fn().mockRejectedValue('rate limited');
    const errorLog = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    service.onModuleInit();

    await registeredHandler()(message(SOURCE_CHANNEL, react));

    expect(errorLog).toHaveBeenCalledWith(
      'Failed to react to TP feed message',
      'rate limited',
    );
    errorLog.mockRestore();
  });
});
