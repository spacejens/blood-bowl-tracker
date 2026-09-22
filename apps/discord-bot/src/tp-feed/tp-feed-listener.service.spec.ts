import type { MessageHandler } from '@blood-bowl-tracker/discord-client';
import { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Message } from 'discord.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { DiscordBotConfigService } from '../discord-bot-config.service';
import { TpFeedFormatterService } from './tp-feed-formatter.service';
import { TpFeedListenerService } from './tp-feed-listener.service';
import { TpFeedParserService } from './tp-feed-parser.service';

const SOURCE_CHANNEL = '910000000000000000';
const DEBUG_CHANNEL = '920000000000000000';
const MESSAGE_URL =
  'https://discord.com/channels/900000000000000000/910000000000000000/930000000000000000';

function message(channelId: string): Message {
  return { id: 'm1', channelId, url: MESSAGE_URL } as unknown as Message;
}

describe('TpFeedListenerService', () => {
  let service: TpFeedListenerService;
  let discordClient: DeepMockProxy<DiscordClientService>;
  let config: MockProxy<DiscordBotConfigService>;
  let parser: MockProxy<TpFeedParserService>;
  let formatter: MockProxy<TpFeedFormatterService>;

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

  it('posts the formatted interpretation to the debug channel', async () => {
    service.onModuleInit();

    await registeredHandler()(message(SOURCE_CHANNEL));

    expect(parser.parse).toHaveBeenCalled();
    expect(formatter.format).toHaveBeenCalled();
    expect(discordClient.sendMessage).toHaveBeenCalledWith(DEBUG_CHANNEL, {
      content: 'Hired: #3 Ragnfred Brownlock',
      allowedMentions: { parse: [] },
    });
  });

  it('ignores a message from any other channel without parsing it', async () => {
    service.onModuleInit();

    await registeredHandler()(message('999999999999999999'));

    expect(parser.parse).not.toHaveBeenCalled();
    expect(discordClient.sendMessage).not.toHaveBeenCalled();
  });

  it('posts nothing when the parser ignores the message', async () => {
    parser.parse.mockReturnValue({ status: 'ignored' });
    service.onModuleInit();

    await registeredHandler()(message(SOURCE_CHANNEL));

    expect(formatter.format).not.toHaveBeenCalled();
    expect(formatter.formatUnrecognized).not.toHaveBeenCalled();
    expect(discordClient.sendMessage).not.toHaveBeenCalled();
  });

  it('posts an unrecognized notice linking to the original message', async () => {
    parser.parse.mockReturnValue({ status: 'unrecognized' });
    service.onModuleInit();

    await registeredHandler()(message(SOURCE_CHANNEL));

    expect(formatter.formatUnrecognized).toHaveBeenCalledWith(MESSAGE_URL);
    expect(formatter.format).not.toHaveBeenCalled();
    expect(discordClient.sendMessage).toHaveBeenCalledWith(DEBUG_CHANNEL, {
      content: `Unrecognized TP notification — ${MESSAGE_URL}`,
      allowedMentions: { parse: [] },
    });
  });

  it('posts nothing for an unrecognized message when no debug channel is configured', async () => {
    parser.parse.mockReturnValue({ status: 'unrecognized' });
    config.getTpFeedDebugDiscordChannel.mockReturnValue(undefined);
    service.onModuleInit();

    await registeredHandler()(message(SOURCE_CHANNEL));

    expect(parser.parse).toHaveBeenCalled();
    expect(formatter.formatUnrecognized).not.toHaveBeenCalled();
    expect(discordClient.sendMessage).not.toHaveBeenCalled();
  });

  it('still parses but posts nothing when no debug channel is configured', async () => {
    config.getTpFeedDebugDiscordChannel.mockReturnValue(undefined);
    service.onModuleInit();

    await registeredHandler()(message(SOURCE_CHANNEL));

    expect(parser.parse).toHaveBeenCalled();
    expect(discordClient.sendMessage).not.toHaveBeenCalled();
  });

  it('logs and swallows a failure to post', async () => {
    const errorLog = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    discordClient.sendMessage.mockRejectedValue(new Error('channel gone'));
    service.onModuleInit();

    await expect(
      registeredHandler()(message(SOURCE_CHANNEL)),
    ).resolves.toBeUndefined();

    expect(errorLog).toHaveBeenCalledWith(
      'Failed to post TP feed message',
      expect.any(String),
    );
    errorLog.mockRestore();
  });
});
