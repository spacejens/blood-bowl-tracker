import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StartupNotifierService } from './startup-notifier.service';
import type { DiscordClientService } from '@blood-bowl-tracker/discord-client';

describe('StartupNotifierService', () => {
  let discordClient: { sendMessage: ReturnType<typeof vi.fn> };
  let service: StartupNotifierService;
  const originalChannelId = process.env.DISCORD_CHANNEL_ID;

  beforeEach(() => {
    discordClient = { sendMessage: vi.fn().mockResolvedValue(undefined) };
    service = new StartupNotifierService(
      discordClient as unknown as DiscordClientService,
    );
  });

  afterEach(() => {
    if (originalChannelId === undefined) {
      delete process.env.DISCORD_CHANNEL_ID;
    } else {
      process.env.DISCORD_CHANNEL_ID = originalChannelId;
    }
  });

  it('posts the startup message to the configured channel', async () => {
    process.env.DISCORD_CHANNEL_ID = '42';
    await service.onApplicationBootstrap();
    expect(discordClient.sendMessage).toHaveBeenCalledWith(
      '42',
      'Hello tLoEG, I am alive',
    );
  });

  it('throws when the channel id is not configured', async () => {
    delete process.env.DISCORD_CHANNEL_ID;
    await expect(service.onApplicationBootstrap()).rejects.toThrow(
      'DISCORD_CHANNEL_ID is not configured',
    );
  });
});
