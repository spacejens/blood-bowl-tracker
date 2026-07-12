import type { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { DiscordBotConfigService } from './discord-bot-config.service';
import type { InsightsCommandService } from './slash-commands/insights-command.service';
import { StartupNotifierService } from './startup-notifier.service';

describe('StartupNotifierService', () => {
  let discordClient: { sendMessage: ReturnType<typeof vi.fn> };
  let insightsCommand: { resolveRandomFact: ReturnType<typeof vi.fn> };
  let config: { getDiscordChannelId: ReturnType<typeof vi.fn> };
  let service: StartupNotifierService;

  beforeEach(() => {
    discordClient = { sendMessage: vi.fn().mockResolvedValue(undefined) };
    insightsCommand = {
      resolveRandomFact: vi.fn().mockResolvedValue('a random fact'),
    };
    config = { getDiscordChannelId: vi.fn().mockReturnValue('42') };
    service = new StartupNotifierService(
      discordClient as unknown as DiscordClientService,
      insightsCommand as unknown as InsightsCommandService,
      config as unknown as DiscordBotConfigService,
    );
  });

  it('posts a random insights fact string to the configured channel', async () => {
    await service.onApplicationBootstrap();
    expect(insightsCommand.resolveRandomFact).toHaveBeenCalled();
    expect(discordClient.sendMessage).toHaveBeenCalledWith(
      '42',
      'a random fact',
    );
  });

  it('posts an embed fact to the configured channel', async () => {
    const embed = {
      embeds: [{ title: 'I have knowledge of', description: 'Leagues: 3' }],
    };
    insightsCommand.resolveRandomFact.mockResolvedValue(embed);
    await service.onApplicationBootstrap();
    expect(discordClient.sendMessage).toHaveBeenCalledWith('42', embed);
  });

  it('propagates the error when the channel id is not configured', async () => {
    config.getDiscordChannelId.mockImplementation(() => {
      throw new Error('DISCORD_CHANNEL_ID is not configured');
    });
    await expect(service.onApplicationBootstrap()).rejects.toThrow(
      'DISCORD_CHANNEL_ID is not configured',
    );
    expect(insightsCommand.resolveRandomFact).not.toHaveBeenCalled();
  });
});
