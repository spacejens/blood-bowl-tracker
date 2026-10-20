import { Test } from '@nestjs/testing';
import { DiscordAPIError, HTTPError, REST } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mock, MockProxy } from 'vitest-mock-extended';

import { DiscordBotTokenService } from '../discord-bot-token/discord-bot-token.service';
import {
  installDiscordRestMock,
  MockRest,
  resetDiscordRestMock,
} from './discord-js-rest-mock.test-helpers';
import { DiscordRestService } from './discord-rest.service';

vi.mock('discord.js', async () =>
  (
    await import('./discord-js-rest-mock.test-helpers.js')
  ).discordJsModuleMock(),
);

function discordApiError(
  status: number,
  code: number,
  message: string,
): DiscordAPIError {
  return new DiscordAPIError(
    { message, code },
    code,
    status,
    'GET',
    '/fake/url',
    {},
  );
}

describe('DiscordRestService', () => {
  let service: DiscordRestService;
  let botToken: MockProxy<DiscordBotTokenService>;
  let rest: MockRest;

  beforeEach(async () => {
    rest = installDiscordRestMock();
    botToken = mock<DiscordBotTokenService>();
    botToken.read.mockResolvedValue('secret-bot-token');

    const moduleRef = await Test.createTestingModule({
      providers: [
        DiscordRestService,
        { provide: DiscordBotTokenService, useValue: botToken },
      ],
    }).compile();
    service = moduleRef.get(DiscordRestService);
  });

  afterEach(() => {
    resetDiscordRestMock();
  });

  describe('getMessage', () => {
    it('GETs the single-message route and returns the body unchanged', async () => {
      const body = { id: '333', embeds: [{ title: 'Match result' }] };
      rest.get.mockResolvedValue(body);

      const result = await service.getMessage('222', '333');

      expect(rest.get).toHaveBeenCalledWith('/fake/channels/222/messages/333', {
        query: undefined,
      });
      expect(result).toBe(body);
    });

    it('builds a v10 client on the global fetch with a 30s timeout, authorized with the bot token', async () => {
      rest.get.mockResolvedValue({});

      await service.getMessage('222', '333');

      expect(vi.mocked(REST)).toHaveBeenLastCalledWith({
        version: '10',
        timeout: 30_000,
        makeRequest: fetch,
      });
      expect(rest.setToken).toHaveBeenCalledWith('secret-bot-token');
    });

    it('names the message, status, Discord code and message on a Discord API error', async () => {
      rest.get.mockRejectedValue(
        discordApiError(404, 10008, 'Unknown Message'),
      );

      await expect(service.getMessage('222', '333')).rejects.toThrow(
        'Discord API request for message 333 in channel 222 failed with ' +
          'status 404 (code 10008): Unknown Message',
      );
    });

    it('names the message and status on an HTTP error, even with an empty status text', async () => {
      rest.get.mockRejectedValue(
        new HTTPError(502, '', 'GET', '/fake/url', {}),
      );

      await expect(service.getMessage('222', '333')).rejects.toThrow(
        'Discord API request for message 333 in channel 222 failed with ' +
          'status 502: ',
      );
    });

    it('names the message, status and status text on an HTTP error', async () => {
      rest.get.mockRejectedValue(
        new HTTPError(502, 'Bad Gateway', 'GET', '/fake/url', {}),
      );

      await expect(service.getMessage('222', '333')).rejects.toThrow(
        'Discord API request for message 333 in channel 222 failed with ' +
          'status 502: Bad Gateway',
      );
    });

    it('names the message on any other failure', async () => {
      rest.get.mockRejectedValue(new Error('Request aborted'));

      await expect(service.getMessage('222', '333')).rejects.toThrow(
        'Discord API request for message 333 in channel 222 failed: ' +
          'Request aborted',
      );
    });

    it('stringifies a non-Error failure', async () => {
      rest.get.mockRejectedValue('socket hang up');

      await expect(service.getMessage('222', '333')).rejects.toThrow(
        'Discord API request for message 333 in channel 222 failed: ' +
          'socket hang up',
      );
    });

    it('keeps the original failure as the cause', async () => {
      const original = discordApiError(401, 0, '401: Unauthorized');
      rest.get.mockRejectedValue(original);

      const error: unknown = await service
        .getMessage('222', '333')
        .catch((e: unknown) => e);

      expect((error as Error).cause).toBe(original);
    });

    it('propagates a token read failure without calling Discord', async () => {
      botToken.read.mockRejectedValue(new Error('DISCORD_BOT_TOKEN is empty'));

      await expect(service.getMessage('222', '333')).rejects.toThrow(
        /DISCORD_BOT_TOKEN is empty/,
      );
      expect(rest.get).not.toHaveBeenCalled();
    });
  });

  describe('getRecentMessages', () => {
    it('GETs the channel-messages route with the limit query and returns the body unchanged', async () => {
      const body = [{ id: '1', embeds: [{ title: 'Round 3' }] }];
      rest.get.mockResolvedValue(body);

      const result = await service.getRecentMessages('123456789', 5);

      expect(rest.get).toHaveBeenCalledTimes(1);
      const [route, options] = rest.get.mock.calls[0] as [
        string,
        { query: URLSearchParams },
      ];
      expect(route).toBe('/fake/channels/123456789/messages');
      expect(options.query.toString()).toBe('limit=5');
      expect(result).toBe(body);
    });

    it('builds a v10 client on the global fetch with a 30s timeout, authorized with the bot token', async () => {
      rest.get.mockResolvedValue([]);

      await service.getRecentMessages('123456789', 5);

      expect(vi.mocked(REST)).toHaveBeenLastCalledWith({
        version: '10',
        timeout: 30_000,
        makeRequest: fetch,
      });
      expect(rest.setToken).toHaveBeenCalledWith('secret-bot-token');
    });

    it('names the channel, count, status, Discord code and message on a Discord API error', async () => {
      rest.get.mockRejectedValue(discordApiError(403, 50001, 'Missing Access'));

      await expect(service.getRecentMessages('123456789', 5)).rejects.toThrow(
        'Discord API request for the 5 most recent messages of channel ' +
          '123456789 failed with status 403 (code 50001): Missing Access',
      );
    });

    it('names the channel and count on any other failure', async () => {
      rest.get.mockRejectedValue(new Error('Request aborted'));

      await expect(service.getRecentMessages('123456789', 5)).rejects.toThrow(
        'Discord API request for the 5 most recent messages of channel ' +
          '123456789 failed: Request aborted',
      );
    });
  });
});
