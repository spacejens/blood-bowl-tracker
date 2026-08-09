import { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { DiscordBotConfigService } from './discord-bot-config.service';
import { InsightsCommandService } from './slash-commands/insights-command.service';
import { StartupNotifierService } from './startup-notifier.service';

describe('StartupNotifierService', () => {
  let discordClient: MockProxy<DiscordClientService>;
  let insightsCommand: MockProxy<InsightsCommandService>;
  let config: MockProxy<DiscordBotConfigService>;
  let service: StartupNotifierService;

  beforeEach(async () => {
    discordClient = mock<DiscordClientService>();
    discordClient.sendMessage.mockResolvedValue(undefined);
    insightsCommand = mock<InsightsCommandService>();
    insightsCommand.resolveCategory.mockResolvedValue('the stats fact');
    config = mock<DiscordBotConfigService>();
    config.getStartupMessageDiscordChannel.mockReturnValue('42');

    const moduleRef = await Test.createTestingModule({
      providers: [
        StartupNotifierService,
        { provide: DiscordClientService, useValue: discordClient },
        { provide: InsightsCommandService, useValue: insightsCommand },
        { provide: DiscordBotConfigService, useValue: config },
      ],
    }).compile();
    service = moduleRef.get(StartupNotifierService);
  });

  it('posts the unfiltered stats insight to the configured channel', async () => {
    await service.onApplicationBootstrap();
    expect(insightsCommand.resolveCategory).toHaveBeenCalledWith('stats', {});
    expect(insightsCommand.resolveRandomFact).not.toHaveBeenCalled();
    expect(discordClient.sendMessage).toHaveBeenCalledWith(
      '42',
      'the stats fact',
    );
  });

  it('posts an embed fact to the configured channel', async () => {
    const embed = {
      embeds: [{ title: 'I have knowledge of', description: 'Leagues: 3' }],
    };
    insightsCommand.resolveCategory.mockResolvedValue(embed);
    await service.onApplicationBootstrap();
    expect(discordClient.sendMessage).toHaveBeenCalledWith('42', embed);
  });

  it('propagates the error when the channel id is not configured', async () => {
    config.getStartupMessageDiscordChannel.mockImplementation(() => {
      throw new Error('STARTUP_MESSAGE_DISCORD_CHANNEL is not configured');
    });
    await expect(service.onApplicationBootstrap()).rejects.toThrow(
      'STARTUP_MESSAGE_DISCORD_CHANNEL is not configured',
    );
    expect(insightsCommand.resolveCategory).not.toHaveBeenCalled();
  });
});
