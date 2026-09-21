import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { DiscordBotTokenService } from '../discord-bot-token/discord-bot-token.service';
import { FetchDiscordMessageService } from './fetch-discord-message.service';

describe('FetchDiscordMessageService', () => {
  let service: FetchDiscordMessageService;
  let botToken: MockProxy<DiscordBotTokenService>;
  let fetchMock: ReturnType<typeof vi.fn>;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(async () => {
    botToken = mock<DiscordBotTokenService>();
    botToken.read.mockResolvedValue('secret-bot-token');

    originalFetch = globalThis.fetch;
    fetchMock = vi.fn();
    Object.defineProperty(globalThis, 'fetch', {
      value: fetchMock,
      configurable: true,
      writable: true,
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        FetchDiscordMessageService,
        { provide: DiscordBotTokenService, useValue: botToken },
      ],
    }).compile();
    service = moduleRef.get(FetchDiscordMessageService);
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'fetch', {
      value: originalFetch,
      configurable: true,
      writable: true,
    });
  });

  it('calls the v10 single-message endpoint with the link’s channel and message ids, returning the parsed body unchanged', async () => {
    const body = { id: '333', embeds: [{ title: 'Match result' }] };
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    });

    const result = await service.run(
      'https://discord.com/channels/111/222/333',
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://discord.com/api/v10/channels/222/messages/333',
      { headers: { Authorization: 'Bot secret-bot-token' } },
    );
    expect(result).toEqual(body);
  });

  it('throws with the status and Discord error body on a non-2xx response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      text: () => Promise.resolve('{"message":"Unknown Message","code":10008}'),
    });

    await expect(
      service.run('https://discord.com/channels/111/222/333'),
    ).rejects.toThrow(/404.*Unknown Message/s);
  });

  it('rejects a link that is not a Discord message link, before reading the token or calling Discord', async () => {
    await expect(service.run('https://example.com/whatever')).rejects.toThrow(
      /discord\.com\/channels/,
    );
    expect(botToken.read).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a channel link with no message id', async () => {
    await expect(
      service.run('https://discord.com/channels/111/222'),
    ).rejects.toThrow(/discord\.com\/channels/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a link whose ids are not numeric', async () => {
    await expect(
      service.run('https://discord.com/channels/guild/channel/message'),
    ).rejects.toThrow(/discord\.com\/channels/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
