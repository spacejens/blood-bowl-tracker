import { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { DeploymentInfoService } from './deployment-info.service';
import { DiscordBotConfigService } from './discord-bot-config.service';
import { InsightsCommandService } from './slash-commands/insights-command.service';
import { StartupNotifierService } from './startup-notifier.service';

describe('StartupNotifierService', () => {
  let discordClient: MockProxy<DiscordClientService>;
  let insightsCommand: MockProxy<InsightsCommandService>;
  let config: MockProxy<DiscordBotConfigService>;
  let deploymentInfo: MockProxy<DeploymentInfoService>;
  let service: StartupNotifierService;

  beforeEach(async () => {
    discordClient = mock<DiscordClientService>();
    discordClient.sendMessage.mockResolvedValue(undefined);
    insightsCommand = mock<InsightsCommandService>();
    insightsCommand.resolveCategory.mockResolvedValue('the stats fact');
    config = mock<DiscordBotConfigService>();
    config.getStartupMessageDiscordChannel.mockReturnValue('42');
    config.getDiscordBotToken.mockReturnValue('the-token');
    deploymentInfo = mock<DeploymentInfoService>();
    deploymentInfo.describe.mockReturnValue('Bot starting as **active**');

    const moduleRef = await Test.createTestingModule({
      providers: [
        StartupNotifierService,
        { provide: DiscordClientService, useValue: discordClient },
        { provide: InsightsCommandService, useValue: insightsCommand },
        { provide: DiscordBotConfigService, useValue: config },
        { provide: DeploymentInfoService, useValue: deploymentInfo },
      ],
    }).compile();
    service = moduleRef.get(StartupNotifierService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('active path', () => {
    it('posts the deployment status line and then the stats insight', async () => {
      await service.postActiveStartupMessage();

      expect(deploymentInfo.describe).toHaveBeenCalledWith('active');
      expect(insightsCommand.resolveCategory).toHaveBeenCalledWith('stats', {});
      expect(insightsCommand.resolveRandomFact).not.toHaveBeenCalled();
      expect(discordClient.sendMessage.mock.calls).toEqual([
        ['42', 'Bot starting as **active**'],
        ['42', 'the stats fact'],
      ]);
    });

    it('posts an embed fact to the configured channel', async () => {
      const embed = {
        embeds: [{ title: 'I have knowledge of', description: 'Leagues: 3' }],
      };
      insightsCommand.resolveCategory.mockResolvedValue(embed);

      await service.postActiveStartupMessage();

      expect(discordClient.sendMessage).toHaveBeenLastCalledWith('42', embed);
    });

    it('propagates the error when the channel id is not configured', async () => {
      config.getStartupMessageDiscordChannel.mockImplementation(() => {
        throw new Error('STARTUP_MESSAGE_DISCORD_CHANNEL is not configured');
      });

      await expect(service.postActiveStartupMessage()).rejects.toThrow(
        'STARTUP_MESSAGE_DISCORD_CHANNEL is not configured',
      );
      expect(insightsCommand.resolveCategory).not.toHaveBeenCalled();
    });
  });

  describe('standby path', () => {
    it('posts the status line over REST without touching the gateway', async () => {
      deploymentInfo.describe.mockReturnValue('Bot starting as **standby**');
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
      vi.stubGlobal('fetch', fetchMock);

      await service.postStandbyStartupMessage();

      expect(deploymentInfo.describe).toHaveBeenCalledWith('standby');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://discord.com/api/v10/channels/42/messages',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bot the-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: 'Bot starting as **standby**' }),
        },
      );
      expect(discordClient.sendMessage).not.toHaveBeenCalled();
      expect(insightsCommand.resolveCategory).not.toHaveBeenCalled();
    });

    it('swallows a non-ok REST response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: false, status: 401 }),
      );

      await expect(
        service.postStandbyStartupMessage(),
      ).resolves.toBeUndefined();
    });

    it('swallows a rejected REST call', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

      await expect(
        service.postStandbyStartupMessage(),
      ).resolves.toBeUndefined();
    });

    it('swallows a missing channel configuration', async () => {
      config.getStartupMessageDiscordChannel.mockImplementation(() => {
        throw new Error('STARTUP_MESSAGE_DISCORD_CHANNEL is not configured');
      });
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      await expect(
        service.postStandbyStartupMessage(),
      ).resolves.toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
