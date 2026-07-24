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
    insightsCommand.resolveRandomFact.mockResolvedValue('a random fact');
    config = mock<DiscordBotConfigService>();
    config.getDiscordChannelId.mockReturnValue('42');

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

  it('posts a random insights fact string to the configured channel', async () => {
    await service.onApplicationBootstrap();
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vitest-mock-extended mock method, not a real bound method
    expect(insightsCommand.resolveRandomFact).toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vitest-mock-extended mock method, not a real bound method
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
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vitest-mock-extended mock method, not a real bound method
    expect(discordClient.sendMessage).toHaveBeenCalledWith('42', embed);
  });

  it('propagates the error when the channel id is not configured', async () => {
    config.getDiscordChannelId.mockImplementation(() => {
      throw new Error('DISCORD_CHANNEL_ID is not configured');
    });
    await expect(service.onApplicationBootstrap()).rejects.toThrow(
      'DISCORD_CHANNEL_ID is not configured',
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vitest-mock-extended mock method, not a real bound method
    expect(insightsCommand.resolveRandomFact).not.toHaveBeenCalled();
  });
});
