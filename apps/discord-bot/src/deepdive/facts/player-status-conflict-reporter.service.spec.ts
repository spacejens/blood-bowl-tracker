import { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import { Test } from '@nestjs/testing';
import { MessageFlags } from 'discord.js';
import { beforeEach, describe, expect, it } from 'vitest';
import type { DeepMockProxy, MockProxy } from 'vitest-mock-extended';
import { mock, mockDeep } from 'vitest-mock-extended';

import { DiscordBotConfigService } from '../../discord-bot-config.service';
import { ErrorLogService } from '../../shared/error-log.service';
import { PlayerStatusConflictReporterService } from './player-status-conflict-reporter.service';

const DEBUG_CHANNEL = 'debug-channel';
const CONFLICT = { id: 1, name: 'Griff Oberwald', status: 'active' } as const;
const REPORT =
  'Bug: player 1 (Griff Oberwald) is killed in match events, but their stored status is active';

describe('PlayerStatusConflictReporterService', () => {
  let service: PlayerStatusConflictReporterService;
  let discordClient: DeepMockProxy<DiscordClientService>;
  let config: MockProxy<DiscordBotConfigService>;
  let errorLog: MockProxy<ErrorLogService>;

  beforeEach(async () => {
    discordClient = mockDeep<DiscordClientService>();
    config = mock<DiscordBotConfigService>();
    config.getTpFeedDebugDiscordChannelId.mockReturnValue(DEBUG_CHANNEL);
    errorLog = mock<ErrorLogService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PlayerStatusConflictReporterService,
        { provide: DiscordClientService, useValue: discordClient },
        { provide: DiscordBotConfigService, useValue: config },
        { provide: ErrorLogService, useValue: errorLog },
      ],
    }).compile();
    service = moduleRef.get(PlayerStatusConflictReporterService);
  });

  it('logs the conflict as an error', async () => {
    await service.report(CONFLICT);

    expect(errorLog.logError).toHaveBeenCalledWith(
      service['logger'],
      'Player status conflicts with match events',
      expect.objectContaining({ message: REPORT }),
    );
  });

  it('posts the bug report to the debug channel without mentions or previews', async () => {
    await service.report(CONFLICT);

    expect(discordClient.sendMessage).toHaveBeenCalledWith(DEBUG_CHANNEL, {
      content: REPORT,
      allowedMentions: { parse: [] },
      flags: [MessageFlags.SuppressEmbeds],
    });
  });

  it('only logs when no debug channel is configured', async () => {
    config.getTpFeedDebugDiscordChannelId.mockReturnValue(undefined);

    await service.report(CONFLICT);

    expect(discordClient.sendMessage).not.toHaveBeenCalled();
    expect(errorLog.logError).toHaveBeenCalledTimes(1);
  });

  it('logs a failed post instead of rejecting', async () => {
    const error = new Error('missing access');
    discordClient.sendMessage.mockRejectedValue(error);

    await expect(service.report(CONFLICT)).resolves.toBeUndefined();
    expect(errorLog.logError).toHaveBeenCalledWith(
      service['logger'],
      'Failed to post player status conflict report',
      error,
    );
  });
});
