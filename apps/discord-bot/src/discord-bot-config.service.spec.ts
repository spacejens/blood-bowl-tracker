import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mock, type MockProxy } from 'vitest-mock-extended';

import { DiscordBotConfigService } from './discord-bot-config.service';

describe('DiscordBotConfigService', () => {
  let service: DiscordBotConfigService;
  let configService: MockProxy<ConfigService>;

  beforeEach(async () => {
    configService = mock<ConfigService>();
    const moduleRef = await Test.createTestingModule({
      providers: [
        DiscordBotConfigService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();
    service = moduleRef.get(DiscordBotConfigService);
  });

  it('returns the configured database URL', () => {
    configService.get.mockImplementation((key: string) =>
      key === 'DATABASE_URL' ? 'postgres://x' : undefined,
    );
    expect(service.getDatabaseUrl()).toBe('postgres://x');
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vitest-mock-extended mock method, not a real bound method
    expect(configService.get).toHaveBeenCalledWith('DATABASE_URL');
  });

  it('throws when the database URL is not configured', () => {
    configService.get.mockReturnValue(undefined);
    expect(() => service.getDatabaseUrl()).toThrow(
      'DATABASE_URL is not configured',
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vitest-mock-extended mock method, not a real bound method
    expect(configService.get).toHaveBeenCalledWith('DATABASE_URL');
  });

  it('returns the configured Discord bot token', () => {
    configService.get.mockImplementation((key: string) =>
      key === 'DISCORD_BOT_TOKEN' ? 'tkn' : undefined,
    );
    expect(service.getDiscordBotToken()).toBe('tkn');
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vitest-mock-extended mock method, not a real bound method
    expect(configService.get).toHaveBeenCalledWith('DISCORD_BOT_TOKEN');
  });

  it('throws when the Discord bot token is not configured', () => {
    configService.get.mockReturnValue(undefined);
    expect(() => service.getDiscordBotToken()).toThrow(
      'DISCORD_BOT_TOKEN is not configured',
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vitest-mock-extended mock method, not a real bound method
    expect(configService.get).toHaveBeenCalledWith('DISCORD_BOT_TOKEN');
  });

  it('returns the configured Discord channel ID', () => {
    configService.get.mockImplementation((key: string) =>
      key === 'DISCORD_CHANNEL_ID' ? '42' : undefined,
    );
    expect(service.getDiscordChannelId()).toBe('42');
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vitest-mock-extended mock method, not a real bound method
    expect(configService.get).toHaveBeenCalledWith('DISCORD_CHANNEL_ID');
  });

  it('throws when the Discord channel ID is not configured', () => {
    configService.get.mockReturnValue(undefined);
    expect(() => service.getDiscordChannelId()).toThrow(
      'DISCORD_CHANNEL_ID is not configured',
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vitest-mock-extended mock method, not a real bound method
    expect(configService.get).toHaveBeenCalledWith('DISCORD_CHANNEL_ID');
  });

  it('returns the configured port as a number', () => {
    configService.get.mockImplementation((key: string) =>
      key === 'PORT' ? '4000' : undefined,
    );
    expect(service.getPort()).toBe(4000);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vitest-mock-extended mock method, not a real bound method
    expect(configService.get).toHaveBeenCalledWith('PORT');
  });

  it('defaults to port 3000 when not configured', () => {
    configService.get.mockReturnValue(undefined);
    expect(service.getPort()).toBe(3000);
    // eslint-disable-next-line @typescript-eslint/unbound-method -- vitest-mock-extended mock method, not a real bound method
    expect(configService.get).toHaveBeenCalledWith('PORT');
  });
});
