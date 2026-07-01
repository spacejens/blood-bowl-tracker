import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';

interface MockChannel {
  isSendable: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
}

interface MockClient {
  channels: { fetch: ReturnType<typeof vi.fn> };
  once: ReturnType<typeof vi.fn>;
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

  it('provides DiscordClientService via forRootAsync', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DiscordClientModule.forRootAsync({ useFactory: () => 'tkn' })],
    }).compile();
    expect(moduleRef.get(DiscordClientService)).toBeInstanceOf(
      DiscordClientService,
    );
  });
});
