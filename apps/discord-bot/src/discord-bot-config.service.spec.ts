import { describe, it, expect } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { DiscordBotConfigService } from './discord-bot-config.service';

describe('DiscordBotConfigService', () => {
  it('returns the configured database URL', () => {
    const service = new DiscordBotConfigService(
      new ConfigService({ DATABASE_URL: 'postgres://x' }),
    );
    expect(service.getDatabaseUrl()).toBe('postgres://x');
  });

  it('throws when the database URL is not configured', () => {
    const service = new DiscordBotConfigService(new ConfigService({}));
    expect(() => service.getDatabaseUrl()).toThrow(
      'DATABASE_URL is not configured',
    );
  });

  it('returns the configured Discord bot token', () => {
    const service = new DiscordBotConfigService(
      new ConfigService({ DISCORD_BOT_TOKEN: 'tkn' }),
    );
    expect(service.getDiscordBotToken()).toBe('tkn');
  });

  it('throws when the Discord bot token is not configured', () => {
    const service = new DiscordBotConfigService(new ConfigService({}));
    expect(() => service.getDiscordBotToken()).toThrow(
      'DISCORD_BOT_TOKEN is not configured',
    );
  });

  it('returns the configured Discord channel ID', () => {
    const service = new DiscordBotConfigService(
      new ConfigService({ DISCORD_CHANNEL_ID: '42' }),
    );
    expect(service.getDiscordChannelId()).toBe('42');
  });

  it('throws when the Discord channel ID is not configured', () => {
    const service = new DiscordBotConfigService(new ConfigService({}));
    expect(() => service.getDiscordChannelId()).toThrow(
      'DISCORD_CHANNEL_ID is not configured',
    );
  });

  it('returns the configured port as a number', () => {
    const service = new DiscordBotConfigService(
      new ConfigService({ PORT: '4000' }),
    );
    expect(service.getPort()).toBe(4000);
  });

  it('defaults to port 3000 when not configured', () => {
    const service = new DiscordBotConfigService(new ConfigService({}));
    expect(service.getPort()).toBe(3000);
  });
});
