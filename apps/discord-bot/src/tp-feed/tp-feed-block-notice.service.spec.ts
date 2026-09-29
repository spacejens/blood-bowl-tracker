import { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MessageFlags } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { DiscordBotConfigService } from '../discord-bot-config.service';
import { TpFeedBlockNoticeService } from './tp-feed-block-notice.service';
import { TpFeedFormatterService } from './tp-feed-formatter.service';

const DEBUG_CHANNEL = 'debug-channel';
const RETRY_AT = new Date('2026-09-29T12:05:00.000Z');

describe('TpFeedBlockNoticeService', () => {
  let service: TpFeedBlockNoticeService;
  let discordClient: DeepMockProxy<DiscordClientService>;
  let config: MockProxy<DiscordBotConfigService>;
  let formatter: MockProxy<TpFeedFormatterService>;

  beforeEach(async () => {
    discordClient = mockDeep<DiscordClientService>();
    config = mock<DiscordBotConfigService>();
    config.getTpFeedDebugDiscordChannel.mockReturnValue(DEBUG_CHANNEL);
    formatter = mock<TpFeedFormatterService>();
    formatter.formatBlocked.mockReturnValue('blocked notice');
    formatter.formatResumed.mockReturnValue('resumed notice');
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const moduleRef = await Test.createTestingModule({
      providers: [
        TpFeedBlockNoticeService,
        { provide: DiscordClientService, useValue: discordClient },
        { provide: DiscordBotConfigService, useValue: config },
        { provide: TpFeedFormatterService, useValue: formatter },
      ],
    }).compile();
    service = moduleRef.get(TpFeedBlockNoticeService);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts the block notice to the debug channel without mentions or previews, and logs it as a warning', async () => {
    await service.announceBlocked(RETRY_AT);

    expect(formatter.formatBlocked).toHaveBeenCalledWith(RETRY_AT);
    expect(discordClient.sendMessage).toHaveBeenCalledWith(DEBUG_CHANNEL, {
      content: 'blocked notice',
      allowedMentions: { parse: [] },
      flags: [MessageFlags.SuppressEmbeds],
    });
    expect(Logger.prototype.warn).toHaveBeenCalledWith('blocked notice');
  });

  it('posts the resume notice to the debug channel and logs it', async () => {
    await service.announceResumed();

    expect(discordClient.sendMessage).toHaveBeenCalledWith(DEBUG_CHANNEL, {
      content: 'resumed notice',
      allowedMentions: { parse: [] },
      flags: [MessageFlags.SuppressEmbeds],
    });
    expect(Logger.prototype.log).toHaveBeenCalledWith('resumed notice');
  });

  it('only logs when no debug channel is configured', async () => {
    config.getTpFeedDebugDiscordChannel.mockReturnValue(undefined);

    await service.announceBlocked(RETRY_AT);

    expect(discordClient.sendMessage).not.toHaveBeenCalled();
    expect(Logger.prototype.warn).toHaveBeenCalledWith('blocked notice');
  });

  it('logs a failed post instead of rejecting', async () => {
    discordClient.sendMessage.mockRejectedValue(new Error('missing access'));

    await expect(service.announceResumed()).resolves.toBeUndefined();
    expect(Logger.prototype.error).toHaveBeenCalledWith(
      'Failed to post TP block notice',
      expect.stringContaining('missing access'),
    );
  });

  it('logs a failed post that rejected with a non-Error', async () => {
    discordClient.sendMessage.mockRejectedValue('nope');

    await service.announceResumed();

    expect(Logger.prototype.error).toHaveBeenCalledWith(
      'Failed to post TP block notice',
      'nope',
    );
  });
});
