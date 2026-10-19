import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { DiscordRestService } from '../discord-rest/discord-rest.service';
import { FetchRecentDiscordMessagesService } from './fetch-recent-discord-messages.service';

describe('FetchRecentDiscordMessagesService', () => {
  let service: FetchRecentDiscordMessagesService;
  let discordRest: MockProxy<DiscordRestService>;

  beforeEach(async () => {
    discordRest = mock<DiscordRestService>();

    const moduleRef = await Test.createTestingModule({
      providers: [
        FetchRecentDiscordMessagesService,
        { provide: DiscordRestService, useValue: discordRest },
      ],
    }).compile();
    service = moduleRef.get(FetchRecentDiscordMessagesService);
  });

  it('fetches the channel’s recent messages with the count, returning Discord’s body unchanged', async () => {
    const body = [{ id: '1', embeds: [{ title: 'Round 3' }] }];
    discordRest.getRecentMessages.mockResolvedValue(body);

    const result = await service.run('123456789', 5);

    expect(discordRest.getRecentMessages).toHaveBeenCalledWith('123456789', 5);
    expect(result).toBe(body);
  });

  it('accepts a count of 100, the top of Discord’s allowed range', async () => {
    discordRest.getRecentMessages.mockResolvedValue([]);

    await service.run('123456789', 100);

    expect(discordRest.getRecentMessages).toHaveBeenCalledWith(
      '123456789',
      100,
    );
  });

  it('propagates a Discord failure unchanged', async () => {
    discordRest.getRecentMessages.mockRejectedValue(
      new Error('Discord API request for channel 123456789 failed'),
    );

    await expect(service.run('123456789', 5)).rejects.toThrow(
      /channel 123456789 failed/,
    );
  });

  it('rejects a count above Discord’s limit before reading the token or calling Discord', async () => {
    await expect(service.run('123456789', 101)).rejects.toThrow(
      /between 1 and 100/,
    );
    expect(discordRest.getRecentMessages).not.toHaveBeenCalled();
  });

  it('rejects a count below 1 before reading the token or calling Discord', async () => {
    await expect(service.run('123456789', 0)).rejects.toThrow(
      /between 1 and 100/,
    );
    expect(discordRest.getRecentMessages).not.toHaveBeenCalled();
  });

  it('rejects a non-integer count before reading the token or calling Discord', async () => {
    await expect(service.run('123456789', 2.5)).rejects.toThrow(
      /between 1 and 100/,
    );
    expect(discordRest.getRecentMessages).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric channel id before reading the token or calling Discord', async () => {
    await expect(service.run('not-a-snowflake', 5)).rejects.toThrow(
      /snowflake/,
    );
    expect(discordRest.getRecentMessages).not.toHaveBeenCalled();
  });
});
