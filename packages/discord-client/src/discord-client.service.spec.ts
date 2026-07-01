import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';

interface MockChannel {
  isSendable: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
}

interface MockClient {
  channels: { fetch: ReturnType<typeof vi.fn> };
  once: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  login: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  user: { tag: string };
}

const mockChannel: MockChannel = {
  isSendable: vi.fn(),
  send: vi.fn(),
};

const mockClient: MockClient = {
  channels: { fetch: vi.fn() },
  once: vi.fn(),
  on: vi.fn(),
  login: vi.fn(),
  destroy: vi.fn(),
  user: { tag: 'test-bot#0001' },
};

vi.mock('discord.js', () => ({
  Client: vi.fn(() => mockClient),
  GatewayIntentBits: { Guilds: 1 },
}));

import { DiscordClientModule, DiscordClientService } from './index';

describe('DiscordClientService', () => {
  let service: DiscordClientService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient.once.mockImplementation((event: string, cb: () => void) => {
      if (event === 'ready') cb();
      return mockClient;
    });
    mockClient.login.mockResolvedValue('my-token');
    mockClient.destroy.mockResolvedValue(undefined);
    mockChannel.isSendable.mockReturnValue(true);
    service = new DiscordClientService('my-token');
  });

  it('logs in with the provided token on module init', async () => {
    await service.onModuleInit();
    expect(mockClient.login).toHaveBeenCalledWith('my-token');
  });

  it('sends a message to a sendable channel', async () => {
    mockClient.channels.fetch.mockResolvedValue(mockChannel);
    await service.sendMessage('123', 'hello');
    expect(mockClient.channels.fetch).toHaveBeenCalledWith('123');
    expect(mockChannel.send).toHaveBeenCalledWith('hello');
  });

  it('throws when the channel is not found', async () => {
    mockClient.channels.fetch.mockResolvedValue(null);
    await expect(service.sendMessage('123', 'hello')).rejects.toThrow(
      'Discord channel not found: 123',
    );
  });

  it('throws when the channel is not sendable', async () => {
    mockChannel.isSendable.mockReturnValue(false);
    mockClient.channels.fetch.mockResolvedValue(mockChannel);
    await expect(service.sendMessage('123', 'hello')).rejects.toThrow(
      'Discord channel is not sendable: 123',
    );
  });

  it('destroys the client on module destroy', async () => {
    await service.onModuleDestroy();
    expect(mockClient.destroy).toHaveBeenCalled();
  });

  it('registers a persistent error handler on module init', async () => {
    await service.onModuleInit();
    expect(mockClient.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('rejects init when login fails', async () => {
    mockClient.once.mockImplementation(() => mockClient);
    mockClient.login.mockRejectedValue(new Error('Invalid token'));
    await expect(service.onModuleInit()).rejects.toThrow('Invalid token');
  });

  it('provides DiscordClientService via forRootAsync', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DiscordClientModule.forRootAsync({ useFactory: () => 'tkn' })],
    }).compile();
    expect(moduleRef.get(DiscordClientService)).toBeInstanceOf(
      DiscordClientService,
    );
  });

  it('provides DiscordClientService via forRoot', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DiscordClientModule.forRoot({ token: 'tkn' })],
    }).compile();
    expect(moduleRef.get(DiscordClientService)).toBeInstanceOf(
      DiscordClientService,
    );
  });

  it('rejects init when the client never becomes ready', async () => {
    vi.useFakeTimers();
    try {
      mockClient.once.mockImplementation(() => mockClient);
      mockClient.login.mockReturnValue(new Promise<string>(() => {}));
      const initPromise = service.onModuleInit();
      const assertion = expect(initPromise).rejects.toThrow(
        'Discord client did not become ready',
      );
      await vi.advanceTimersByTimeAsync(30_000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });
});
