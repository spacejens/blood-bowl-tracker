import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StartupNotifierService } from './startup-notifier.service';
import type { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import type { StatsSummaryService } from './insights/stats-summary.service';
import type { DiscordBotConfigService } from './discord-bot-config.service';

describe('StartupNotifierService', () => {
  let discordClient: { sendMessage: ReturnType<typeof vi.fn> };
  let statsSummary: { buildSummaryMessage: ReturnType<typeof vi.fn> };
  let config: { getDiscordChannelId: ReturnType<typeof vi.fn> };
  let service: StartupNotifierService;

  beforeEach(() => {
    discordClient = { sendMessage: vi.fn().mockResolvedValue(undefined) };
    statsSummary = {
      buildSummaryMessage: vi.fn().mockResolvedValue('the summary message'),
    };
    config = { getDiscordChannelId: vi.fn().mockReturnValue('42') };
    service = new StartupNotifierService(
      discordClient as unknown as DiscordClientService,
      statsSummary as unknown as StatsSummaryService,
      config as unknown as DiscordBotConfigService,
    );
  });

  it('posts the stats summary to the configured channel', async () => {
    await service.onApplicationBootstrap();
    expect(statsSummary.buildSummaryMessage).toHaveBeenCalled();
    expect(discordClient.sendMessage).toHaveBeenCalledWith(
      '42',
      'the summary message',
    );
  });

  it('propagates the error when the channel id is not configured', async () => {
    config.getDiscordChannelId.mockImplementation(() => {
      throw new Error('DISCORD_CHANNEL_ID is not configured');
    });
    await expect(service.onApplicationBootstrap()).rejects.toThrow(
      'DISCORD_CHANNEL_ID is not configured',
    );
    expect(statsSummary.buildSummaryMessage).not.toHaveBeenCalled();
  });
});
