import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { DiscordRestService } from '../discord-rest/discord-rest.service';
import { FetchDiscordMessageService } from './fetch-discord-message.service';

describe('FetchDiscordMessageService', () => {
  let service: FetchDiscordMessageService;
  let discordRest: MockProxy<DiscordRestService>;

  beforeEach(async () => {
    discordRest = mock<DiscordRestService>();

    const moduleRef = await Test.createTestingModule({
      providers: [
        FetchDiscordMessageService,
        { provide: DiscordRestService, useValue: discordRest },
      ],
    }).compile();
    service = moduleRef.get(FetchDiscordMessageService);
  });

  it('fetches the link’s channel and message ids, returning Discord’s body unchanged', async () => {
    const body = { id: '333', embeds: [{ title: 'Match result' }] };
    discordRest.getMessage.mockResolvedValue(body);

    const result = await service.run(
      'https://discord.com/channels/111/222/333',
    );

    expect(discordRest.getMessage).toHaveBeenCalledWith('222', '333');
    expect(result).toBe(body);
  });

  it('accepts a canary.discord.com message link, the same as a plain discord.com one', async () => {
    discordRest.getMessage.mockResolvedValue({ id: '333' });

    await service.run('https://canary.discord.com/channels/111/222/333');

    expect(discordRest.getMessage).toHaveBeenCalledWith('222', '333');
  });

  it('propagates a Discord failure unchanged', async () => {
    discordRest.getMessage.mockRejectedValue(
      new Error('Discord API request for message 333 in channel 222 failed'),
    );

    await expect(
      service.run('https://discord.com/channels/111/222/333'),
    ).rejects.toThrow(/message 333 in channel 222 failed/);
  });

  it('rejects a link that is not a Discord message link, before reading the token or calling Discord', async () => {
    await expect(service.run('https://example.com/whatever')).rejects.toThrow(
      /discord\.com\/channels/,
    );
    expect(discordRest.getMessage).not.toHaveBeenCalled();
  });

  it('rejects a channel link with no message id', async () => {
    await expect(
      service.run('https://discord.com/channels/111/222'),
    ).rejects.toThrow(/discord\.com\/channels/);
    expect(discordRest.getMessage).not.toHaveBeenCalled();
  });

  it('rejects a link whose ids are not numeric', async () => {
    await expect(
      service.run('https://discord.com/channels/guild/channel/message'),
    ).rejects.toThrow(/discord\.com\/channels/);
    expect(discordRest.getMessage).not.toHaveBeenCalled();
  });
});
