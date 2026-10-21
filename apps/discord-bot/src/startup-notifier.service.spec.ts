import { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { DeploymentInfoService } from './deployment-info.service';
import { DiscordBotConfigService } from './discord-bot-config.service';
import { ErrorLogService } from './shared/error-log.service';
import { StartupNotifierService } from './startup-notifier.service';

describe('StartupNotifierService', () => {
  let discordClient: MockProxy<DiscordClientService>;
  let config: MockProxy<DiscordBotConfigService>;
  let deploymentInfo: MockProxy<DeploymentInfoService>;
  let errorLog: MockProxy<ErrorLogService>;
  let service: StartupNotifierService;

  beforeEach(async () => {
    discordClient = mock<DiscordClientService>();
    discordClient.sendMessage.mockResolvedValue(undefined);
    discordClient.sendMessageOverRest.mockResolvedValue(undefined);
    config = mock<DiscordBotConfigService>();
    config.getStartupMessageDiscordChannel.mockReturnValue('42');
    config.getStandbyStartupMessageEnabled.mockReturnValue(true);
    deploymentInfo = mock<DeploymentInfoService>();
    deploymentInfo.describe.mockReturnValue({
      embeds: [{ title: 'Bot starting as active' }],
    });

    errorLog = mock<ErrorLogService>();

    const moduleRef = await Test.createTestingModule({
      providers: [
        StartupNotifierService,
        { provide: DiscordClientService, useValue: discordClient },
        { provide: DiscordBotConfigService, useValue: config },
        { provide: DeploymentInfoService, useValue: deploymentInfo },
        { provide: ErrorLogService, useValue: errorLog },
      ],
    }).compile();
    service = moduleRef.get(StartupNotifierService);
  });

  describe('active path', () => {
    it('posts the deployment status embed to the configured channel', async () => {
      await service.postActiveStartupMessage();

      expect(deploymentInfo.describe).toHaveBeenCalledWith('active');
      expect(discordClient.sendMessage.mock.calls).toEqual([
        ['42', { embeds: [{ title: 'Bot starting as active' }] }],
      ]);
    });

    it('propagates the error when the channel id is not configured', async () => {
      config.getStartupMessageDiscordChannel.mockImplementation(() => {
        throw new Error('STARTUP_MESSAGE_DISCORD_CHANNEL is not configured');
      });

      await expect(service.postActiveStartupMessage()).rejects.toThrow(
        'STARTUP_MESSAGE_DISCORD_CHANNEL is not configured',
      );
      expect(discordClient.sendMessage).not.toHaveBeenCalled();
    });

    it('propagates the error when sending the status line fails', async () => {
      discordClient.sendMessage.mockRejectedValue(new Error('gateway down'));

      await expect(service.postActiveStartupMessage()).rejects.toThrow(
        'gateway down',
      );
    });
  });

  describe('standby path', () => {
    it('posts the status embed over REST without touching the gateway', async () => {
      deploymentInfo.describe.mockReturnValue({
        embeds: [{ title: 'Bot starting as standby' }],
      });

      await service.postStandbyStartupMessage();

      expect(deploymentInfo.describe).toHaveBeenCalledWith('standby');
      expect(discordClient.sendMessageOverRest.mock.calls).toEqual([
        ['42', { embeds: [{ title: 'Bot starting as standby' }] }],
      ]);
      expect(discordClient.sendMessage).not.toHaveBeenCalled();
    });

    it('swallows a rejection from the REST client', async () => {
      const error = new Error('401 Unauthorized');
      discordClient.sendMessageOverRest.mockRejectedValue(error);

      await expect(
        service.postStandbyStartupMessage(),
      ).resolves.toBeUndefined();
      expect(errorLog.logError).toHaveBeenCalledWith(
        service['logger'],
        'Failed to post standby startup message',
        error,
      );
    });

    it('swallows a missing channel configuration', async () => {
      const error = new Error(
        'STARTUP_MESSAGE_DISCORD_CHANNEL is not configured',
      );
      config.getStartupMessageDiscordChannel.mockImplementation(() => {
        throw error;
      });

      await expect(
        service.postStandbyStartupMessage(),
      ).resolves.toBeUndefined();
      expect(errorLog.logError).toHaveBeenCalledWith(
        service['logger'],
        'Failed to post standby startup message',
        error,
      );
      expect(discordClient.sendMessageOverRest).not.toHaveBeenCalled();
    });

    it('skips the announcement entirely when the toggle is disabled', async () => {
      config.getStandbyStartupMessageEnabled.mockReturnValue(false);

      await expect(
        service.postStandbyStartupMessage(),
      ).resolves.toBeUndefined();
      expect(discordClient.sendMessageOverRest).not.toHaveBeenCalled();
      expect(deploymentInfo.describe).not.toHaveBeenCalled();
      expect(discordClient.sendMessage).not.toHaveBeenCalled();
      expect(errorLog.logError).not.toHaveBeenCalled();
    });
  });
});
