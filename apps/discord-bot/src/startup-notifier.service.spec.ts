import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StartupNotifierService } from './startup-notifier.service';
import type { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import type { StatsSummaryService } from './insights/stats-summary.service';

describe('StartupNotifierService', () => {
  let discordClient: { sendMessage: ReturnType<typeof vi.fn> };
  let statsSummary: { buildSummaryMessage: ReturnType<typeof vi.fn> };
  let service: StartupNotifierService;
  const originalChannelId = process.env.DISCORD_CHANNEL_ID;

  beforeEach(() => {
    discordClient = { sendMessage: vi.fn().mockResolvedValue(undefined) };
    statsSummary = {
      buildSummaryMessage: vi.fn().mockResolvedValue('the summary message'),
    };
    service = new StartupNotifierService(
      discordClient as unknown as DiscordClientService,
      statsSummary as unknown as StatsSummaryService,
    );
  });

  afterEach(() => {
    if (originalChannelId === undefined) {
      delete process.env.DISCORD_CHANNEL_ID;
    } else {
      process.env.DISCORD_CHANNEL_ID = originalChannelId;
    }
  });

  it('posts the stats summary to the configured channel', async () => {
    process.env.DISCORD_CHANNEL_ID = '42';
    await service.onApplicationBootstrap();
    expect(statsSummary.buildSummaryMessage).toHaveBeenCalled();
    expect(discordClient.sendMessage).toHaveBeenCalledWith(
      '42',
      'the summary message',
    );
  });

  it('throws when the channel id is not configured', async () => {
    delete process.env.DISCORD_CHANNEL_ID;
    await expect(service.onApplicationBootstrap()).rejects.toThrow(
      'DISCORD_CHANNEL_ID is not configured',
    );
    expect(statsSummary.buildSummaryMessage).not.toHaveBeenCalled();
  });
});
