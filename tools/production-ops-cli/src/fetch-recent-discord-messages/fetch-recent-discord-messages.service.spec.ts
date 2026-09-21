import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { DiscordBotTokenService } from '../discord-bot-token/discord-bot-token.service';
import { FetchRecentDiscordMessagesService } from './fetch-recent-discord-messages.service';

describe('FetchRecentDiscordMessagesService', () => {
  let service: FetchRecentDiscordMessagesService;
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
        FetchRecentDiscordMessagesService,
        { provide: DiscordBotTokenService, useValue: botToken },
      ],
    }).compile();
    service = moduleRef.get(FetchRecentDiscordMessagesService);
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'fetch', {
      value: originalFetch,
      configurable: true,
      writable: true,
    });
  });

  it('calls the v10 messages endpoint with the limit and bot authorization, returning the parsed body unchanged', async () => {
    const body = [{ id: '1', embeds: [{ title: 'Round 3' }] }];
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    });

    const result = await service.run('123456789', 5);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://discord.com/api/v10/channels/123456789/messages?limit=5',
      { headers: { Authorization: 'Bot secret-bot-token' } },
    );
    expect(result).toEqual(body);
  });

  it('throws with the status and Discord error body on a non-2xx response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve('{"message":"Missing Access","code":50001}'),
    });

    await expect(service.run('123456789', 5)).rejects.toThrow(
      /403.*Missing Access/s,
    );
  });

  it('never includes the bot token in the failure message', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('{"message":"401: Unauthorized"}'),
    });

    const error: unknown = await service
      .run('123456789', 5)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain('secret-bot-token');
  });

  it('accepts a count of 100, the top of Discord’s allowed range', async () => {
    const body = [{ id: '1' }];
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    });

    const result = await service.run('123456789', 100);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://discord.com/api/v10/channels/123456789/messages?limit=100',
      { headers: { Authorization: 'Bot secret-bot-token' } },
    );
    expect(result).toEqual(body);
  });

  it('rejects a count above Discord’s limit before reading the token or calling Discord', async () => {
    await expect(service.run('123456789', 101)).rejects.toThrow(
      /between 1 and 100/,
    );
    expect(botToken.read).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a count below 1 before reading the token or calling Discord', async () => {
    await expect(service.run('123456789', 0)).rejects.toThrow(
      /between 1 and 100/,
    );
    expect(botToken.read).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a non-integer count before reading the token or calling Discord', async () => {
    await expect(service.run('123456789', 2.5)).rejects.toThrow(
      /between 1 and 100/,
    );
    expect(botToken.read).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric channel id before reading the token or calling Discord', async () => {
    await expect(service.run('not-a-snowflake', 5)).rejects.toThrow(
      /snowflake/,
    );
    expect(botToken.read).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
