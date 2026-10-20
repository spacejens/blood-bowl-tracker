import { UsageTrackingService } from '@blood-bowl-tracker/discord-bot-usage';
import type {
  HandledInteraction,
  InteractionHandledListener,
} from '@blood-bowl-tracker/discord-client';
import { DiscordClientService } from '@blood-bowl-tracker/discord-client';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MockProxy } from 'vitest-mock-extended';
import { mock } from 'vitest-mock-extended';

import { UsageRecordingService } from './usage-recording.service';

const INTERACTION: HandledInteraction = {
  kind: 'command',
  name: 'stats',
  occurredAt: new Date('2026-10-20T12:00:00.000Z'),
  discordUserId: 'u1',
  username: 'spacejens',
  discordGuildId: 'g1',
  guildName: 'The Pitch',
  nickname: 'Skitter',
  discordChannelId: 'c1',
  channelName: 'general',
  outcome: 'success',
  parameters: [{ key: 'category', value: 'matches' }],
};

describe('UsageRecordingService', () => {
  let service: UsageRecordingService;
  let discordClient: MockProxy<DiscordClientService>;
  let usageTracking: MockProxy<UsageTrackingService>;

  /** The listener the service registered with the Discord client. */
  function registeredListener(): InteractionHandledListener {
    const call =
      discordClient.registerInteractionHandledListener.mock.calls.at(0);
    if (!call) throw new Error('no interaction-handled listener registered');
    return call[0];
  }

  beforeEach(async () => {
    discordClient = mock<DiscordClientService>();
    usageTracking = mock<UsageTrackingService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsageRecordingService,
        { provide: DiscordClientService, useValue: discordClient },
        { provide: UsageTrackingService, useValue: usageTracking },
      ],
    }).compile();
    service = moduleRef.get(UsageRecordingService);
  });

  it('registers no listener before module init', () => {
    expect(
      discordClient.registerInteractionHandledListener,
    ).not.toHaveBeenCalled();
  });

  it('registers exactly one interaction-handled listener on module init', () => {
    service.onModuleInit();

    expect(
      discordClient.registerInteractionHandledListener,
    ).toHaveBeenCalledTimes(1);
  });

  it('records each handled interaction through UsageTrackingService', async () => {
    usageTracking.recordInteraction.mockResolvedValue(undefined);
    service.onModuleInit();

    await registeredListener()(INTERACTION);

    expect(usageTracking.recordInteraction).toHaveBeenCalledWith(INTERACTION);
  });

  it('lets a recording failure reject, for the Discord client to log', async () => {
    usageTracking.recordInteraction.mockRejectedValue(new Error('db down'));
    service.onModuleInit();

    await expect(registeredListener()(INTERACTION)).rejects.toThrow('db down');
  });
});
